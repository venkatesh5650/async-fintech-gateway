# app/core/broker.py

"""
Redis Streams Enterprise Message Broker Module
-----------------------------------------------
Provides cloud-native message queuing abstractions using Redis Streams 
and Consumer Groups (Day 61: Phase 2 Core Engine).

Decouples HTTP request ingestion from heavy LangGraph compute tasks,
ensuring at-least-once delivery guarantees and zero ASGI thread starvation.
"""

import os
import time
import logging
from typing import Optional, Any
import redis.asyncio as redis
from redis.exceptions import ResponseError

logger = logging.getLogger(__name__)

# --- CONFIGURATION & IDENTIFIERS ---
DEFAULT_REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
STREAM_INTEL_JOBS = os.getenv("INTEL_STREAM_NAME", "stream:intel_jobs")
GROUP_INTEL_WORKERS = os.getenv("INTEL_CONSUMER_GROUP", "intel_workers_group")
STREAM_INTEL_DLQ = os.getenv("INTEL_DLQ_STREAM_NAME", "stream:intel_jobs:dlq")
MAX_DELIVERY_ATTEMPTS = int(os.getenv("MAX_DELIVERY_ATTEMPTS", "3"))
CLAIM_MIN_IDLE_MS = int(os.getenv("CLAIM_MIN_IDLE_MS", "30000"))

# Singleton async client pool
_client: Optional[redis.Redis] = None


def get_redis_client() -> redis.Redis:
    """
    Retrieves or initializes the shared async Redis connection pool.
    """
    global _client
    if _client is None:
        _client = redis.from_url(DEFAULT_REDIS_URL, decode_responses=True)
    return _client


async def close_redis_client() -> None:
    """
    Gracefully terminates the connection pool during application shutdown.
    """
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
        logger.info("[BROKER] Redis client connection pool closed.")


async def ensure_consumer_group(
    stream: str = STREAM_INTEL_JOBS,
    group: str = GROUP_INTEL_WORKERS,
    client: Optional[redis.Redis] = None
) -> bool:
    """
    Idempotently provisions the Redis Stream and Consumer Group.
    Uses 'MKSTREAM' to create the stream if it does not exist, and starts
    from the latest offset ('$') for new messages.
    """
    rc = client or get_redis_client()
    try:
        await rc.xgroup_create(name=stream, groupname=group, id="$", mkstream=True)
        logger.info(f"✅ [BROKER INIT] Created Consumer Group '{group}' on Stream '{stream}'.")
        return True
    except ResponseError as exc:
        if "BUSYGROUP" in str(exc):
            logger.debug(f"[BROKER INIT] Consumer Group '{group}' already initialized on '{stream}'.")
            return True
        logger.error(f"❌ [BROKER ERROR] Failed to initialize Consumer Group '{group}' on '{stream}': {exc}")
        raise exc


async def enqueue_intelligence_job(
    job_id: str,
    ticker: str,
    batch_id: Optional[str] = None,
    trace_id: Optional[str] = None,
    client: Optional[redis.Redis] = None
) -> str:
    """
    Event Publisher (Edge Ingestion).
    Appends a new intelligence analysis event payload to the Redis Stream.
    Returns the auto-generated monotonic stream entry ID (e.g., '1710000000000-0').
    """
    rc = client or get_redis_client()
    payload = {
        "job_id": job_id,
        "ticker": ticker.upper(),
        "batch_id": batch_id or "",
        "trace_id": trace_id or "",
        "enqueued_at": str(time.time())
    }

    message_id = await rc.xadd(STREAM_INTEL_JOBS, payload)
    logger.info(
        f"[STREAM PUBLISH] Enqueued Job {job_id} ({ticker.upper()}) to '{STREAM_INTEL_JOBS}' -> Msg ID: {message_id}"
    )
    return message_id


async def enqueue_batch_intelligence_jobs(
    jobs: list[dict[str, Any]],
    batch_id: str,
    trace_id: Optional[str] = None,
    client: Optional[redis.Redis] = None
) -> list[str]:
    """
    High-Throughput Pipelined Batch Publisher.
    Enqueues multiple intelligence tasks using a single network round-trip.
    """
    rc = client or get_redis_client()
    now_str = str(time.time())

    async with rc.pipeline(transaction=False) as pipe:
        for job in jobs:
            payload = {
                "job_id": job["job_id"],
                "ticker": job["ticker"].upper(),
                "batch_id": batch_id,
                "trace_id": trace_id or "",
                "enqueued_at": now_str
            }
            pipe.xadd(STREAM_INTEL_JOBS, payload)
        
        message_ids = await pipe.execute()

    logger.info(
        f"[STREAM BATCH PUBLISH] Enqueued {len(jobs)} jobs for Batch {batch_id} to '{STREAM_INTEL_JOBS}'"
    )
    return message_ids


async def get_stream_len(stream: str = STREAM_INTEL_JOBS, client: Optional[redis.Redis] = None) -> int:
    """
    Returns the total number of entries currently stored in the stream.
    """
    rc = client or get_redis_client()
    return await rc.xlen(stream)


async def get_pending_summary(
    stream: str = STREAM_INTEL_JOBS,
    group: str = GROUP_INTEL_WORKERS,
    client: Optional[redis.Redis] = None
) -> dict:
    """
    Inspects the Pending Entries List (PEL) for unacknowledged messages.
    Crucial for detecting consumer crashes and un-ACKed message lag.
    """
    rc = client or get_redis_client()
    return await rc.xpending(stream, group)


async def reclaim_abandoned_jobs(
    consumer_name: str,
    stream: str = STREAM_INTEL_JOBS,
    group: str = GROUP_INTEL_WORKERS,
    min_idle_ms: int = CLAIM_MIN_IDLE_MS,
    count: int = 10,
    start_id: str = "0-0",
    client: Optional[redis.Redis] = None,
) -> tuple[str, list[tuple[str, dict[str, Any]]]]:
    """
    Executes XAUTOCLAIM to safely transfer ownership of orphaned/abandoned
    in-flight messages from dead or hung workers to the active consumer.
    Returns (next_start_id, list_of_claimed_messages).
    """
    rc = client or get_redis_client()
    try:
        result = await rc.xautoclaim(
            name=stream,
            groupname=group,
            consumername=consumer_name,
            min_idle_time=min_idle_ms,
            start_id=start_id,
            count=count,
        )
        next_id = result[0]
        messages = result[1]
        if messages:
            logger.warning(
                f"🛡️ [CRASH RECOVERY] Reclaimed {len(messages)} abandoned message(s) from PEL into '{consumer_name}'"
            )
        return next_id, messages
    except Exception as exc:
        logger.error(f"❌ [AUTOCLAIM ERROR] Failed to reclaim abandoned jobs: {exc}")
        return start_id, []


async def route_to_dlq(
    message_id: str,
    payload: dict[str, Any],
    error_reason: str,
    delivery_count: int,
    source_stream: str = STREAM_INTEL_JOBS,
    group: str = GROUP_INTEL_WORKERS,
    dlq_stream: str = STREAM_INTEL_DLQ,
    client: Optional[redis.Redis] = None,
) -> str:
    """
    Dead-Letter Queue Dispatcher (Quarantine).
    Permanently isolates poison pill messages that exceeded MAX_DELIVERY_ATTEMPTS.
    Appends enriched diagnostic metadata to DLQ and removes the poisoned message
    from the primary stream via XACK.
    """
    rc = client or get_redis_client()
    dlq_payload = {
        "original_message_id": message_id,
        "job_id": payload.get("job_id", ""),
        "ticker": payload.get("ticker", ""),
        "batch_id": payload.get("batch_id", ""),
        "trace_id": payload.get("trace_id", ""),
        "delivery_count": str(delivery_count),
        "error_reason": error_reason,
        "quarantined_at": str(time.time()),
    }

    # 1. Write to DLQ stream
    dlq_msg_id = await rc.xadd(dlq_stream, dlq_payload)

    # 2. Cleanly acknowledge and purge from primary stream PEL
    await rc.xack(source_stream, group, message_id)

    logger.critical(
        f"☠️ [DLQ ROUTED] Quarantined poison message {message_id} (Job: {payload.get('job_id')}, Ticker: {payload.get('ticker')}) -> DLQ Msg ID: {dlq_msg_id} | Attempts: {delivery_count} | Reason: {error_reason}"
    )
    return dlq_msg_id


async def get_dlq_entries(
    count: int = 50,
    dlq_stream: str = STREAM_INTEL_DLQ,
    client: Optional[redis.Redis] = None,
) -> list[dict[str, Any]]:
    """
    Reads recent entries from the Dead-Letter Queue for CQRS audit and admin review.
    """
    rc = client or get_redis_client()
    try:
        entries = await rc.xrevrange(dlq_stream, max="+", min="-", count=count)
        result = []
        for msg_id, fields in entries:
            result.append({"dlq_id": msg_id, **fields})
        return result
    except Exception as exc:
        logger.error(f"Failed to read DLQ entries: {exc}")
        return []


async def get_message_delivery_count(
    message_id: str,
    stream: str = STREAM_INTEL_JOBS,
    group: str = GROUP_INTEL_WORKERS,
    client: Optional[redis.Redis] = None,
) -> int:
    """
    Queries the stream's Pending Entries List (PEL) for the exact number
    of times a message has been delivered to workers.
    """
    rc = client or get_redis_client()
    try:
        pending = await rc.xpending_range(
            name=stream,
            groupname=group,
            min=message_id,
            max=message_id,
            count=1,
        )
        if pending and len(pending) > 0:
            return int(pending[0].get("delivery_count", 1))
        return 1
    except Exception:
        return 1
