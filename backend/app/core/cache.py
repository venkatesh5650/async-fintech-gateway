import os
import json
import time
import uuid
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any
import redis.asyncio as redis
from sqlalchemy import select

from app.database.database import AsyncSessionLocal
from app.database.models import Ticker, MarketPricing
from app.core.telemetry import generate_span_id

logger = logging.getLogger("cache_manager")

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
DEFAULT_CACHE_TTL_SEC = int(os.getenv("INTEL_CACHE_TTL_SEC", "300"))
MUTEX_LOCK_TIMEOUT_SEC = int(os.getenv("MUTEX_LOCK_TIMEOUT_SEC", "5"))
MUTEX_WAIT_TIMEOUT_SEC = float(os.getenv("MUTEX_WAIT_TIMEOUT_SEC", "2.5"))
MUTEX_POLL_INTERVAL_SEC = float(os.getenv("MUTEX_POLL_INTERVAL_SEC", "0.05"))

LUA_RELEASE_LOCK = """
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
"""


class CacheAsideManager:
    """
    Cache-Aside read-through and cache coordination layer with distributed mutex protection.
    Directs reads to in-memory Redis keys first, falling back to PostgreSQL
    time-series persistent storage on cache misses, and prevents cache stampedes
    under concurrent load using an atomic SET NX EX lease lock.
    """

    def __init__(self, redis_url: Optional[str] = None):
        self.redis_url = redis_url or REDIS_URL
        self._client: Optional[redis.Redis] = None
        self.hit_count: int = 0
        self.miss_count: int = 0
        self.contention_count: int = 0

    async def get_client(self) -> redis.Redis:
        if self._client is None:
            self._client = redis.from_url(self.redis_url, decode_responses=True)
        return self._client

    @staticmethod
    def get_cache_key(ticker: str) -> str:
        return f"cache:intel:{ticker.upper()}"

    @staticmethod
    def get_lock_key(ticker: str) -> str:
        return f"lock:intel:{ticker.upper()}"

    async def get_cached_result(
        self,
        ticker: str,
        trace_id: Optional[str] = None,
        force_refresh: bool = False,
    ) -> Dict[str, Any]:
        """
        Retrieves intelligence analysis for the requested ticker.
        Executes a non-blocking Redis GET lookup. If unavailable or if
        force_refresh is specified, coordinates concurrent access via
        an atomic distributed mutex to prevent database stampedes.
        """
        client = await self.get_client()
        cache_key = self.get_cache_key(ticker)
        span_id = generate_span_id()
        upper_ticker = ticker.upper()

        if not force_refresh:
            t0 = time.perf_counter()
            cached_raw = await client.get(cache_key)
            if cached_raw:
                try:
                    payload = json.loads(cached_raw)
                    ttl = await client.ttl(cache_key)
                    elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
                    self.hit_count += 1

                    payload["prime_origin"] = payload.get("source") or payload.get("prime_origin") or "CACHE"
                    payload["cache_hit"] = True
                    payload["source"] = "CACHE"
                    payload["cache_ttl_remaining"] = max(0, ttl)
                    payload["data_source_latency_ms"] = elapsed_ms
                    payload["span_id"] = span_id
                    payload["mutex_contention"] = False
                    payload["lock_wait_ms"] = 0.0
                    if trace_id:
                        payload["trace_id"] = trace_id

                    return payload
                except Exception as parse_err:
                    logger.warning(f"Failed to parse cached payload for {upper_ticker}: {parse_err}")

        # Cache Miss or Forced Refresh
        self.miss_count += 1
        lock_key = self.get_lock_key(upper_ticker)
        lock_token = str(uuid.uuid4())

        if force_refresh:
            t_db_start = time.perf_counter()
            db_payload = await self._fetch_from_database(upper_ticker)
            db_latency_ms = round((time.perf_counter() - t_db_start) * 1000, 2)

            db_payload["cache_hit"] = False
            db_payload["source"] = "DATABASE"
            db_payload["cache_ttl_remaining"] = DEFAULT_CACHE_TTL_SEC
            db_payload["data_source_latency_ms"] = db_latency_ms
            db_payload["span_id"] = span_id
            db_payload["mutex_contention"] = False
            db_payload["lock_wait_ms"] = 0.0
            if trace_id:
                db_payload["trace_id"] = trace_id

            await self.set_cached_result(upper_ticker, db_payload, ttl=DEFAULT_CACHE_TTL_SEC)
            return db_payload

        # Attempt atomic mutex acquisition (SET NX EX)
        acquired = await client.set(lock_key, lock_token, nx=True, ex=MUTEX_LOCK_TIMEOUT_SEC)

        if acquired:
            try:
                t_db_start = time.perf_counter()
                db_payload = await self._fetch_from_database(upper_ticker)
                db_latency_ms = round((time.perf_counter() - t_db_start) * 1000, 2)

                db_payload["cache_hit"] = False
                db_payload["source"] = "DATABASE"
                db_payload["cache_ttl_remaining"] = DEFAULT_CACHE_TTL_SEC
                db_payload["data_source_latency_ms"] = db_latency_ms
                db_payload["span_id"] = span_id
                db_payload["mutex_contention"] = False
                db_payload["lock_wait_ms"] = 0.0
                if trace_id:
                    db_payload["trace_id"] = trace_id

                await self.set_cached_result(upper_ticker, db_payload, ttl=DEFAULT_CACHE_TTL_SEC)
                return db_payload
            finally:
                try:
                    await client.eval(LUA_RELEASE_LOCK, 1, lock_key, lock_token)
                except Exception as release_err:
                    logger.warning(f"Failed to release mutex lock for {upper_ticker}: {release_err}")
        else:
            # Contention detected: await leader priming within bounded timeout
            self.contention_count += 1
            t_wait_start = time.perf_counter()
            deadline = time.time() + MUTEX_WAIT_TIMEOUT_SEC

            while time.time() < deadline:
                await asyncio.sleep(MUTEX_POLL_INTERVAL_SEC)
                cached_raw = await client.get(cache_key)
                if cached_raw:
                    try:
                        payload = json.loads(cached_raw)
                        ttl = await client.ttl(cache_key)
                        wait_ms = round((time.perf_counter() - t_wait_start) * 1000, 2)
                        self.hit_count += 1

                        payload["prime_origin"] = "MUTEX_WAIT"
                        payload["cache_hit"] = True
                        payload["source"] = "CACHE"
                        payload["cache_ttl_remaining"] = max(0, ttl)
                        payload["data_source_latency_ms"] = wait_ms
                        payload["span_id"] = span_id
                        payload["mutex_contention"] = True
                        payload["lock_wait_ms"] = wait_ms
                        if trace_id:
                            payload["trace_id"] = trace_id

                        return payload
                    except Exception:
                        pass

            # Timeout fallback: fetch directly if leader took too long
            t_db_start = time.perf_counter()
            db_payload = await self._fetch_from_database(upper_ticker)
            db_latency_ms = round((time.perf_counter() - t_db_start) * 1000, 2)
            wait_ms = round((time.perf_counter() - t_wait_start) * 1000, 2)

            db_payload["cache_hit"] = False
            db_payload["source"] = "DATABASE"
            db_payload["cache_ttl_remaining"] = DEFAULT_CACHE_TTL_SEC
            db_payload["data_source_latency_ms"] = db_latency_ms
            db_payload["span_id"] = span_id
            db_payload["mutex_contention"] = True
            db_payload["lock_wait_ms"] = wait_ms
            if trace_id:
                db_payload["trace_id"] = trace_id

            await self.set_cached_result(upper_ticker, db_payload, ttl=DEFAULT_CACHE_TTL_SEC)
            return db_payload

    async def set_cached_result(
        self,
        ticker: str,
        data: Dict[str, Any],
        ttl: int = DEFAULT_CACHE_TTL_SEC,
        source: Optional[str] = None,
    ) -> None:
        """
        Explicitly populates or refreshes the cache entry for a ticker.
        Supports Write-Through priming directly from worker daemons.
        """
        client = await self.get_client()
        cache_key = self.get_cache_key(ticker)
        payload_to_store = dict(data)
        now_epoch_ms = int(time.time() * 1000)
        now_iso = datetime.now(timezone.utc).isoformat()
        payload_to_store["cached_at"] = now_epoch_ms
        if "primed_at" not in payload_to_store:
            payload_to_store["primed_at"] = now_iso
        if source:
            payload_to_store["source"] = source
        elif "source" not in payload_to_store:
            payload_to_store["source"] = "WRITE_THROUGH"
        await client.set(cache_key, json.dumps(payload_to_store), ex=ttl)

    async def invalidate(self, ticker: str) -> bool:
        """
        Evicts the cached entry and any lingering mutex lock for a given equity ticker.
        """
        client = await self.get_client()
        cache_key = self.get_cache_key(ticker)
        lock_key = self.get_lock_key(ticker)
        await client.delete(lock_key)
        deleted = await client.delete(cache_key)
        return bool(deleted > 0)

    async def _fetch_from_database(self, ticker: str) -> Dict[str, Any]:
        """
        Reads pricing and relational history from PostgreSQL.
        Calculates moving averages and generates a baseline deterministic report
        if no recent LangGraph job has populated the state.
        """
        async with AsyncSessionLocal() as session:
            ticker_query = select(Ticker).where(Ticker.symbol == ticker)
            ticker_res = await session.execute(ticker_query)
            ticker_obj = ticker_res.scalar_one_or_none()

            if not ticker_obj:
                return {
                    "ticker": ticker,
                    "signal": "INVALID",
                    "analysis_report": f"Ticker {ticker} is not registered in the persistent database.",
                    "current_price": 0.0,
                    "fifty_day_sma": 0.0,
                    "data_points_analyzed": 0,
                    "execution_time_ms": 0.0,
                }

            pricing_query = (
                select(MarketPricing)
                .where(MarketPricing.ticker_id == ticker_obj.id)
                .order_by(MarketPricing.timestamp.desc())
                .limit(50)
            )
            pricing_res = await session.execute(pricing_query)
            prices = pricing_res.scalars().all()

            if not prices:
                return {
                    "ticker": ticker,
                    "signal": "INVALID",
                    "analysis_report": f"No historical market pricing records found for {ticker}.",
                    "current_price": 0.0,
                    "fifty_day_sma": 0.0,
                    "data_points_analyzed": 0,
                    "execution_time_ms": 0.0,
                }

            current_price = float(prices[0].close_price)
            avg_sma = sum(float(p.close_price) for p in prices) / len(prices)

            if current_price > avg_sma * 1.01:
                signal = "BUY"
                reasoning = (
                    f"Quantitative trend indicates upward momentum. "
                    f"Current price (${current_price:.2f}) trades above the 50-period SMA (${avg_sma:.2f})."
                )
            elif current_price < avg_sma * 0.99:
                signal = "SELL"
                reasoning = (
                    f"Quantitative trend indicates downward pressure. "
                    f"Current price (${current_price:.2f}) trades below the 50-period SMA (${avg_sma:.2f})."
                )
            else:
                signal = "HOLD"
                reasoning = (
                    f"Asset remains in consolidation. "
                    f"Current price (${current_price:.2f}) is hovering around the 50-period SMA (${avg_sma:.2f})."
                )

            return {
                "ticker": ticker,
                "company_name": ticker_obj.company_name,
                "signal": signal,
                "analysis_report": reasoning,
                "current_price": round(current_price, 2),
                "fifty_day_sma": round(avg_sma, 2),
                "data_points_analyzed": len(prices),
                "execution_time_ms": 1.5,
            }

    def get_stats(self) -> Dict[str, Any]:
        total = self.hit_count + self.miss_count
        hit_ratio = round((self.hit_count / total * 100), 2) if total > 0 else 0.0
        return {
            "hit_count": self.hit_count,
            "miss_count": self.miss_count,
            "total_requests": total,
            "hit_ratio_pct": hit_ratio,
            "contention_count": self.contention_count,
        }

    async def get_health_metrics(self) -> Dict[str, Any]:
        """
        Gathers real-time operational and memory metrics from Redis and in-memory counters.
        """
        client = await self.get_client()
        total_requests = self.hit_count + self.miss_count
        hit_ratio_pct = round((self.hit_count / total_requests * 100), 2) if total_requests > 0 else 0.0

        cursor = 0
        cache_keys: list[str] = []
        while True:
            cursor, keys = await client.scan(cursor, match="cache:intel:*", count=200)
            cache_keys.extend(keys)
            if cursor == 0:
                break

        memory_used_mb = 0.0
        memory_peak_mb = 0.0
        try:
            info_memory = await client.info("memory")
            used_bytes = info_memory.get("used_memory", 0)
            peak_bytes = info_memory.get("used_memory_peak", 0)
            memory_used_mb = round(used_bytes / (1024 * 1024), 2)
            memory_peak_mb = round(peak_bytes / (1024 * 1024), 2)
        except Exception as e:
            logger.warning(f"Failed to query Redis memory info: {e}")

        return {
            "hit_count": self.hit_count,
            "miss_count": self.miss_count,
            "total_requests": total_requests,
            "hit_ratio_pct": hit_ratio_pct,
            "contention_count": self.contention_count,
            "total_cached_keys": len(cache_keys),
            "memory_used_mb": memory_used_mb,
            "memory_peak_mb": memory_peak_mb,
            "server_timestamp_ms": int(time.time() * 1000),
        }

    async def inspect_ticker_cache(self, ticker: str) -> Dict[str, Any]:
        """
        Inspects the exact granular state of an individual equity symbol in Redis.
        Extracts TTL decay, memory byte consumption, origin metadata, and payload preview.
        """
        client = await self.get_client()
        clean_ticker = ticker.upper()
        cache_key = self.get_cache_key(clean_ticker)

        ttl = await client.ttl(cache_key)
        now_ms = int(time.time() * 1000)

        if ttl < 0:
            return {
                "ticker": clean_ticker,
                "is_cached": False,
                "ttl_remaining_seconds": 0,
                "ttl_total_seconds": 300,
                "payload_size_bytes": 0,
                "prime_origin": None,
                "trace_id": None,
                "primed_at_iso": None,
                "raw_payload_preview": None,
                "server_timestamp_ms": now_ms,
            }

        cached_str = await client.get(cache_key)
        if not cached_str:
            return {
                "ticker": clean_ticker,
                "is_cached": False,
                "ttl_remaining_seconds": 0,
                "ttl_total_seconds": 300,
                "payload_size_bytes": 0,
                "prime_origin": None,
                "trace_id": None,
                "primed_at_iso": None,
                "raw_payload_preview": None,
                "server_timestamp_ms": now_ms,
            }

        payload_bytes = 0
        try:
            usage = await client.memory_usage(cache_key)
            payload_bytes = usage if usage is not None else len(cached_str.encode("utf-8"))
        except Exception:
            payload_bytes = len(cached_str.encode("utf-8"))

        try:
            payload_data = json.loads(cached_str)
            origin = payload_data.get("source") or payload_data.get("prime_origin")
            trace_id = payload_data.get("trace_id")
            primed_at = payload_data.get("primed_at")
        except Exception:
            payload_data = {"raw": cached_str}
            origin = None
            trace_id = None
            primed_at = None

        return {
            "ticker": clean_ticker,
            "is_cached": True,
            "ttl_remaining_seconds": max(0, ttl),
            "ttl_total_seconds": 300,
            "payload_size_bytes": payload_bytes,
            "prime_origin": origin,
            "trace_id": trace_id,
            "primed_at_iso": primed_at,
            "raw_payload_preview": payload_data,
            "server_timestamp_ms": now_ms,
        }


# Global singleton instance
cache_aside_manager = CacheAsideManager()
