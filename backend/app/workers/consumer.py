# app/workers/consumer.py

"""
Dedicated Stream Consumer Worker
---------------------------------
Asynchronous daemon processing intelligence jobs from Redis Streams (stream:intel_jobs).
Operates within consumer group 'intel_workers_group' with explicit acknowledgment (XACK)
and controlled concurrency to safeguard downstream LLM APIs from rate-limit exhaustion.
"""

import os
import sys
import json
import time
import uuid
import signal
import asyncio
import logging
from typing import Optional

# Ensure project root is accessible
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import redis.asyncio as redis
from app.core.broker import (
    STREAM_INTEL_JOBS,
    STREAM_INTEL_DLQ,
    GROUP_INTEL_WORKERS,
    DEFAULT_REDIS_URL,
    MAX_DELIVERY_ATTEMPTS,
    CLAIM_MIN_IDLE_MS,
    ensure_consumer_group,
    reclaim_abandoned_jobs,
    route_to_dlq,
    get_message_delivery_count,
    get_stream_lag,
)
from app.core.emitter import send_to_discord_dlq
from app.core.resilience import (
    CircuitState,
    groq_circuit_breaker,
    is_rate_limit_error,
    calculate_backoff_with_jitter,
)
from app.routers.intelligence import run_intelligence_worker
from app.core.telemetry import generate_span_id

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [CONSUMER] %(message)s"
)
logger = logging.getLogger(__name__)

MAX_CONCURRENT_JOBS = int(os.getenv("BATCH_CONCURRENCY_LIMIT", "5"))
BLOCK_TIMEOUT_MS = int(os.getenv("CONSUMER_BLOCK_MS", "2000"))

# Dynamic Concurrency Tuning Configuration (Backpressure Control)
MIN_CONCURRENCY = int(os.getenv("MIN_CONCURRENCY", "3"))    # Never drop below (idle baseline)
MAX_CONCURRENCY = int(os.getenv("MAX_CONCURRENCY", "10"))   # Hard cap (Groq free tier safe)
SCALE_UP_THRESHOLD = int(os.getenv("SCALE_UP_THRESHOLD", "5"))  # Lag count that triggers +1 step
LAG_CHECK_INTERVAL_SEC = float(os.getenv("LAG_CHECK_INTERVAL_SEC", "10.0"))  # How often to re-evaluate

# Downstream Rate-Limit & Resilience Configuration
MAX_RATE_LIMIT_RETRIES = int(os.getenv("MAX_RATE_LIMIT_RETRIES", "3"))


class StreamConsumerWorker:
    """
    High-availability Consumer Group Worker for Redis Streams.
    """

    def __init__(
        self,
        consumer_id: Optional[str] = None,
        redis_url: Optional[str] = None,
        max_concurrency: int = MAX_CONCURRENT_JOBS,
    ):
        self.consumer_id = consumer_id or f"worker-{os.getpid()}-{uuid.uuid4().hex[:6]}"
        self.redis_url = redis_url or os.getenv("REDIS_URL", DEFAULT_REDIS_URL)
        self.max_concurrency = max_concurrency
        self.semaphore = asyncio.Semaphore(self.max_concurrency)
        self.redis_client: Optional[redis.Redis] = None
        self.running = False
        self._active_tasks: set[asyncio.Task] = set()

    async def initialize(self) -> None:
        """
        Initializes connection pool and ensures stream consumer group is bootstrapped.
        """
        self.redis_client = redis.from_url(self.redis_url, decode_responses=True)
        await ensure_consumer_group(
            stream=STREAM_INTEL_JOBS,
            group=GROUP_INTEL_WORKERS,
            client=self.redis_client
        )
        logger.info(
            f"🚀 [INIT] Worker '{self.consumer_id}' attached to Group '{GROUP_INTEL_WORKERS}' on Stream '{STREAM_INTEL_JOBS}' (Concurrency: {self.max_concurrency})"
        )

    async def _process_single_message(self, message_id: str, data: dict) -> None:
        """
        Processes an individual stream message under the concurrency semaphore.
        Updates state in Redis and acknowledges message upon successful completion.
        """
        job_id = data.get("job_id")
        ticker = data.get("ticker")
        batch_id = data.get("batch_id")
        trace_id = data.get("trace_id", "")
        parent_span = data.get("enqueue_span_id") or data.get("parent_span_id", "")
        worker_span = generate_span_id()
        enqueued_at = float(data.get("enqueued_at", time.time()))

        if not job_id or not ticker:
            logger.warning(f"⚠️ [MALFORMED] Discarding invalid stream message {message_id}: {data}")
            # Acknowledge malformed messages so they do not jam the PEL
            await self.redis_client.xack(STREAM_INTEL_JOBS, GROUP_INTEL_WORKERS, message_id)
            return

        queue_wait_ms = round((time.time() - enqueued_at) * 1000, 2)
        logger.info(
            f"⚡ [PULL] Processing {ticker.upper()} (Job: {job_id[:8]}.. | Msg ID: {message_id} | Queue Wait: {queue_wait_ms}ms | Trace: {trace_id[:8]}.. | Span: {worker_span})"
        )

        async with self.semaphore:
            # Inspect delivery attempts to prevent poison-pill crash loops
            delivery_count = await get_message_delivery_count(
                message_id=message_id,
                stream=STREAM_INTEL_JOBS,
                group=GROUP_INTEL_WORKERS,
                client=self.redis_client
            )

            if delivery_count > MAX_DELIVERY_ATTEMPTS:
                logger.critical(
                    f"☠️ [POISON PILL QUARANTINE] Job {job_id} ({ticker.upper()}) exceeded {MAX_DELIVERY_ATTEMPTS} attempts (current: {delivery_count}). Routing to DLQ."
                )
                dead_letter_payload = {
                    "job_id": job_id,
                    "status": "dead_lettered",
                    "ticker": ticker.upper(),
                    "error": f"Quarantined to Dead-Letter Queue after {delivery_count} failed attempts.",
                    "delivery_count": delivery_count,
                    "quarantined_at": int(time.time() * 1000)
                }
                await self.redis_client.set(job_id, json.dumps(dead_letter_payload), ex=3600)

                await route_to_dlq(
                    message_id=message_id,
                    payload=data,
                    error_reason=f"Exceeded max delivery attempts ({delivery_count}/{MAX_DELIVERY_ATTEMPTS})",
                    delivery_count=delivery_count,
                    parent_span_id=parent_span,
                    client=self.redis_client
                )

                try:
                    await send_to_discord_dlq(
                        payload={"job_id": job_id, "ticker": ticker.upper(), "trace_id": trace_id},
                        error_msg=f"Job exceeded {MAX_DELIVERY_ATTEMPTS} attempts. Quarantined to DLQ."
                    )
                except Exception:
                    pass
                return

            # Transition state from 'queued' to 'processing'
            raw_state = await self.redis_client.get(job_id)
            if raw_state:
                try:
                    state_obj = json.loads(raw_state)
                    state_obj["status"] = "processing"
                    await self.redis_client.set(job_id, json.dumps(state_obj), ex=3600)
                except Exception:
                    pass

            # Fault-Tolerant Execution: Circuit Breaker & Jittered Exponential Backoff
            executed_successfully = False
            for attempt in range(1, MAX_RATE_LIMIT_RETRIES + 1):
                try:
                    # Check if circuit breaker allows execution
                    if not groq_circuit_breaker.can_execute():
                        cooldown_wait = max(1.0, min(groq_circuit_breaker.get_cooldown_remaining(), 5.0))
                        logger.warning(
                            f"🛑 [CIRCUIT OPEN] Groq LLM circuit breaker is {groq_circuit_breaker.state.value}. "
                            f"Waiting {cooldown_wait}s before execution trial {attempt}/{MAX_RATE_LIMIT_RETRIES}..."
                        )
                        await asyncio.sleep(cooldown_wait)

                    # Execute heavy LangGraph multi-agent analysis with distributed trace context
                    await run_intelligence_worker(
                        job_id=job_id,
                        ticker=ticker,
                        trace_id=trace_id,
                        span_id=worker_span,
                        parent_span_id=parent_span,
                        queue_wait_ms=queue_wait_ms,
                    )
                    groq_circuit_breaker.record_success()
                    executed_successfully = True
                    break

                except Exception as exc:
                    if is_rate_limit_error(exc):
                        groq_circuit_breaker.record_failure(exc, is_rate_limit=True)

                        # Immediate Backpressure: Clamp concurrency to MIN_CONCURRENCY
                        if self.max_concurrency > MIN_CONCURRENCY:
                            logger.warning(
                                f"⚠️ [BACKPRESSURE] Rate-limit (429) detected on {ticker.upper()}! "
                                f"Clamping concurrency [{self.max_concurrency} → {MIN_CONCURRENCY}] to protect Groq quota."
                            )
                            self.semaphore = asyncio.Semaphore(MIN_CONCURRENCY)
                            self.max_concurrency = MIN_CONCURRENCY

                        if attempt < MAX_RATE_LIMIT_RETRIES:
                            backoff_delay = calculate_backoff_with_jitter(
                                attempt=attempt,
                                base_delay=2.0,
                                max_delay=15.0,
                                jitter=True,
                            )
                            logger.warning(
                                f"⏳ [RATE-LIMIT RETRY {attempt}/{MAX_RATE_LIMIT_RETRIES}] {ticker.upper()} throttled (429). "
                                f"Backing off with jitter for {backoff_delay}s..."
                            )
                            await asyncio.sleep(backoff_delay)
                        else:
                            logger.error(
                                f"❌ [RATE-LIMIT EXHAUSTED] Job {job_id} ({ticker.upper()}) exhausted {MAX_RATE_LIMIT_RETRIES} retries on 429."
                            )
                    else:
                        # Non-rate-limit error (e.g. fatal data issue or parsing bug)
                        groq_circuit_breaker.record_failure(exc, is_rate_limit=False)
                        logger.error(f"❌ [WORKER ERROR] Job {job_id} failed: {exc}", exc_info=True)
                        break

            if executed_successfully:
                # Explicit message acknowledgment
                await self.redis_client.xack(STREAM_INTEL_JOBS, GROUP_INTEL_WORKERS, message_id)
                logger.info(
                    f"✅ [ACK] Successfully processed and acknowledged {ticker.upper()} (Job: {job_id[:8]}.. | Msg ID: {message_id})"
                )

                # Update batch progress if applicable
                if batch_id:
                    await self._update_batch_progress(batch_id)

    async def _run_concurrency_controller(self) -> None:
        """
        Autonomous Dynamic Concurrency Controller.

        Background coroutine that runs alongside the main polling loop.
        Every LAG_CHECK_INTERVAL_SEC it reads the real stream lag from Redis
        and adjusts self.semaphore to the optimal concurrency level.

        Scaling algorithm:
          - lag == 0              → scale down to MIN_CONCURRENCY (idle)
          - lag <= THRESHOLD      → hold current level (steady state)
          - lag <= THRESHOLD * 3  → step up by +1 (moderate backlog)
          - lag >  THRESHOLD * 3  → jump to MAX_CONCURRENCY (surge)

        The semaphore is replaced atomically: tasks that already hold an
        acquisition on the OLD semaphore complete normally; new tasks pick
        up from the NEW semaphore on their next async with call.
        """
        logger.info(
            f"📊 [CONCURRENCY CTRL] Controller active — "
            f"MIN={MIN_CONCURRENCY}, MAX={MAX_CONCURRENCY}, "
            f"THRESHOLD={SCALE_UP_THRESHOLD}, INTERVAL={LAG_CHECK_INTERVAL_SEC}s"
        )
        while self.running:
            try:
                await asyncio.sleep(LAG_CHECK_INTERVAL_SEC)
                if not self.running:
                    break

                lag_data = await get_stream_lag(
                    stream=STREAM_INTEL_JOBS,
                    group=GROUP_INTEL_WORKERS,
                    client=self.redis_client,
                )
                total_lag = lag_data["lag"] + lag_data["pel_count"]
                current = self.max_concurrency

                # Determine target based on lag level and circuit breaker status
                if groq_circuit_breaker.state == CircuitState.OPEN:
                    # Do not scale up while downstream LLM is tripped
                    target = MIN_CONCURRENCY
                elif total_lag == 0:
                    target = MIN_CONCURRENCY
                elif total_lag <= SCALE_UP_THRESHOLD:
                    target = current  # steady — hold
                elif total_lag <= SCALE_UP_THRESHOLD * 3:
                    target = min(current + 1, MAX_CONCURRENCY)  # step up
                else:
                    target = MAX_CONCURRENCY  # surge — max out

                # Clamp within safe bounds
                target = max(MIN_CONCURRENCY, min(target, MAX_CONCURRENCY))

                if target != current:
                    direction = "⬆️  SCALE UP" if target > current else "⬇️  SCALE DOWN"
                    logger.warning(
                        f"{direction} [{current} → {target}] "
                        f"lag={lag_data['lag']} pel={lag_data['pel_count']} "
                        f"total_lag={total_lag} consumers={lag_data['consumer_count']}"
                    )
                    # Atomic semaphore swap
                    self.semaphore = asyncio.Semaphore(target)
                    self.max_concurrency = target
                else:
                    logger.debug(
                        f"📊 [CONCURRENCY CTRL] Holding at {current} "
                        f"(lag={lag_data['lag']} pel={lag_data['pel_count']})"
                    )

            except asyncio.CancelledError:
                logger.info("📊 [CONCURRENCY CTRL] Controller received cancellation.")
                break
            except Exception as exc:
                logger.error(f"📊 [CONCURRENCY CTRL] Controller error: {exc}")
                await asyncio.sleep(5.0)  # Back off on error, don't tight-loop

    async def _reclaim_abandoned_jobs_cycle(self) -> None:
        """
        Scans the PEL for messages idle for >= CLAIM_MIN_IDLE_MS and reclaims them.
        """
        try:
            start_id = "0-0"
            while self.running:
                next_id, claimed_messages = await reclaim_abandoned_jobs(
                    consumer_name=self.consumer_id,
                    stream=STREAM_INTEL_JOBS,
                    group=GROUP_INTEL_WORKERS,
                    min_idle_ms=CLAIM_MIN_IDLE_MS,
                    count=self.max_concurrency,
                    start_id=start_id,
                    client=self.redis_client,
                )
                for message_id, data in claimed_messages:
                    if not self.running:
                        break
                    logger.info(f"🔄 [RECLAIMING] Re-dispatching claimed message {message_id}")
                    task = asyncio.create_task(self._process_single_message(message_id, data))
                    self._active_tasks.add(task)
                    task.add_done_callback(self._active_tasks.discard)

                if next_id == "0-0" or not claimed_messages:
                    break
                start_id = next_id
        except Exception as err:
            logger.error(f"⚠️ [AUTOCLAIM CYCLE ERROR] {err}")

    async def _update_batch_progress(self, batch_id: str) -> None:
        """
        Updates batch parent status when individual jobs conclude.
        """
        try:
            batch_raw = await self.redis_client.get(f"batch:{batch_id}")
            if not batch_raw:
                return
            batch_data = json.loads(batch_raw)
            jobs = batch_data.get("jobs", [])
            total = len(jobs)
            if total == 0:
                return

            completed = 0
            for j in jobs:
                jid = j.get("job_id")
                if jid:
                    s_raw = await self.redis_client.get(jid)
                    if s_raw:
                        s_data = json.loads(s_raw)
                        if s_data.get("status") in ("completed", "failed", "dead_lettered"):
                            completed += 1

            if completed >= total:
                batch_data["status"] = "completed"
                batch_data["server_timestamp"] = int(time.time() * 1000)
                await self.redis_client.set(f"batch:{batch_id}", json.dumps(batch_data), ex=3600)
                logger.info(f"🏁 [BATCH COMPLETE] Parent Batch {batch_id} fully satisfied ({completed}/{total} jobs).")
        except Exception as err:
            logger.warning(f"Batch progress tracking warning: {err}")

    async def run(self) -> None:
        """
        Primary continuous message consumption loop with periodic crash recovery.
        Launches the DynamicConcurrencyController as a concurrent background task
        so lag monitoring and message processing run independently.
        """
        self.running = True
        logger.info(f"🔄 [LOOP START] Worker '{self.consumer_id}' actively polling Redis Streams...")

        # Launch autonomous concurrency controller as a concurrent background task
        controller_task = asyncio.create_task(
            self._run_concurrency_controller(),
            name=f"concurrency-ctrl-{self.consumer_id}",
        )
        self._active_tasks.add(controller_task)
        controller_task.add_done_callback(self._active_tasks.discard)

        last_claim_time = 0.0
        AUTOCLAIM_INTERVAL_SEC = 10.0

        while self.running:
            try:
                # Periodic auto-claim cycle to recover abandoned jobs from crashed workers
                now = time.time()
                if now - last_claim_time >= AUTOCLAIM_INTERVAL_SEC:
                    last_claim_time = now
                    await self._reclaim_abandoned_jobs_cycle()

                # Gatekeeper: Pause stream ingestion when downstream LLM circuit breaker is tripped
                if not groq_circuit_breaker.can_execute():
                    cooldown_wait = max(1.0, min(groq_circuit_breaker.get_cooldown_remaining(), 5.0))
                    logger.warning(
                        f"⏸️ [POLL PAUSED] Groq LLM circuit breaker is {groq_circuit_breaker.state.value}. "
                        f"Pausing stream ingestion for {cooldown_wait}s to allow quota recovery..."
                    )
                    await asyncio.sleep(cooldown_wait)
                    continue

                # Read new unread messages destined for this consumer group
                # '>' indicates messages never delivered to any other consumer
                response = await self.redis_client.xreadgroup(
                    groupname=GROUP_INTEL_WORKERS,
                    consumername=self.consumer_id,
                    streams={STREAM_INTEL_JOBS: ">"},
                    count=self.max_concurrency,
                    block=BLOCK_TIMEOUT_MS,
                )

                if not response:
                    continue

                for stream_name, messages in response:
                    for message_id, data in messages:
                        if not self.running:
                            break
                        task = asyncio.create_task(self._process_single_message(message_id, data))
                        self._active_tasks.add(task)
                        task.add_done_callback(self._active_tasks.discard)

            except asyncio.CancelledError:
                logger.info("🛑 [CANCELLED] Consumer loop received cancellation signal.")
                break
            except Exception as exc:
                logger.error(f"⚠️ [POLL EXCEPTION] Error in stream consumer loop: {exc}")
                await asyncio.sleep(1.0)

        await self.shutdown()

    async def shutdown(self) -> None:
        """
        Performs graceful shutdown, allowing inflight tasks to complete.
        """
        self.running = False
        logger.info(f"⏳ [SHUTDOWN] Worker '{self.consumer_id}' draining {len(self._active_tasks)} active task(s)...")

        if self._active_tasks:
            await asyncio.gather(*self._active_tasks, return_exceptions=True)

        if self.redis_client:
            await self.redis_client.aclose()
            logger.info("🔌 [DISCONNECT] Redis connection terminated cleanly.")


async def main():
    """CLI Worker Entrypoint."""
    worker = StreamConsumerWorker()
    await worker.initialize()

    loop = asyncio.get_running_loop()
    stop_event = asyncio.Event()

    def handle_signal():
        logger.info("Received termination signal. Requesting stop...")
        worker.running = False
        stop_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, handle_signal)
        except (NotImplementedError, RuntimeError):
            # Windows signal handler fallback
            pass

    try:
        await worker.run()
    except (KeyboardInterrupt, SystemExit):
        await worker.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
