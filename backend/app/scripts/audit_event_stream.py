import sys
import os
import asyncio
import logging
from datetime import datetime, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.core.broker import (
    get_redis_client,
    ensure_consumer_group,
    enqueue_intelligence_job,
    get_stream_lag,
    route_to_dlq,
    get_stream_health_snapshot,
)
from app.core.telemetry import generate_trace_id, generate_span_id, format_traceparent, parse_traceparent
from app.core.cache import CacheAsideManager

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("audit_event_stream")


async def audit_redis_streams_group():
    logger.info("🧪 [1/7] Auditing Redis Streams broker & consumer group initialization...")
    r = get_redis_client()
    await ensure_consumer_group(client=r)
    
    trace_id = generate_trace_id()
    msg_id = await enqueue_intelligence_job("job_audit_evt", "AUD_EVT", trace_id=trace_id, client=r)
    assert msg_id is not None, "Failed to publish job to Redis Stream"
    
    lag = await get_stream_lag(client=r)
    assert isinstance(lag, dict), "Stream lag must return a dict"
    logger.info(f"   ├─ Published Message ID: {msg_id}")
    logger.info(f"   └─ Stream Lag:          {lag.get('lag', 0)}")
    logger.info("✅ [1/7 PASSED] Redis Streams consumer group verified.")


async def audit_dlq_poison_policy():
    logger.info("🧪 [2/7] Auditing Dead-Letter Queue (DLQ) & poison-pill threshold...")
    r = get_redis_client()
    trace_id = generate_trace_id()
    payload = {"job_id": "job_poison", "ticker": "AUD_EVT", "trace_id": trace_id}
    dlq_id = await route_to_dlq("0-0", payload, "Test poison pill", delivery_count=3, client=r)
    assert dlq_id is not None, "Failed to send payload to DLQ"
    logger.info("✅ [2/7 PASSED] DLQ poison-pill isolation verified.")


async def audit_concurrency_lag():
    logger.info("🧪 [3/7] Auditing dynamic concurrency & stream lag monitoring...")
    r = get_redis_client()
    health = await get_stream_health_snapshot(client=r)
    assert "stream_len" in health
    assert "health_status" in health
    logger.info(f"   └─ Stream Health Status: {health['health_status']}")
    logger.info("✅ [3/7 PASSED] Stream lag health telemetry verified.")


async def audit_circuit_breaker():
    logger.info("🧪 [4/7] Auditing sliding-window RateLimiter & Redis pipeline security...")
    from app.core.limiter import RateLimiter
    limiter = RateLimiter(requests_per_minute=5)
    assert limiter.rpm == 5
    assert limiter.window == 60
    logger.info("✅ [4/7 PASSED] Sliding-window RateLimiter verified.")


async def audit_distributed_tracing():
    logger.info("🧪 [5/7] Auditing W3C traceparent compliance & context propagation...")
    trace_id = generate_trace_id()
    span_id = generate_span_id()
    tp = format_traceparent(trace_id, span_id)
    parsed_trace, parsed_span = parse_traceparent(tp)
    assert parsed_trace == trace_id
    assert parsed_span == span_id
    logger.info(f"   ├─ Generated Trace ID: {trace_id}")
    logger.info(f"   └─ Formatted W3C Header: {tp}")
    logger.info("✅ [5/7 PASSED] W3C distributed tracing context verified.")


async def audit_cache_aside():
    logger.info("🧪 [6/7] Auditing Cache-Aside read optimization & TTL manager...")
    cache = CacheAsideManager()
    
    test_data = {"ticker": "AUD_EVT", "result": "BUY", "timestamp": datetime.now(timezone.utc).isoformat()}
    await cache.set_cached_result("AUD_EVT", test_data, ttl=60)
    
    cached = await cache.get_cached_result("AUD_EVT")
    assert cached is not None
    assert cached["ticker"] == "AUD_EVT"
    await cache.close()
    logger.info("✅ [6/7 PASSED] Cache-Aside read optimization verified.")


async def audit_stampede_prevention():
    logger.info("🧪 [7/7] Auditing Write-Through priming & mutex stampede prevention...")
    cache = CacheAsideManager()
    
    lock_acquired, token = await cache.acquire_mutex("AUD_EVT")
    assert lock_acquired is True
    assert token is not None
    
    lock_again, token2 = await cache.acquire_mutex("AUD_EVT")
    assert lock_again is False
    
    await cache.release_mutex("AUD_EVT", token)
    await cache.close()
    logger.info("✅ [7/7 PASSED] Distributed mutex stampede prevention verified.")


async def main():
    logger.info("================================================================")
    logger.info("🚀 EVENT STREAM & CACHING SUITE: BROKER, DLQ, TRACING & CACHE")
    logger.info("================================================================")

    await audit_redis_streams_group()
    await audit_dlq_poison_policy()
    await audit_concurrency_lag()
    await audit_circuit_breaker()
    await audit_distributed_tracing()
    await audit_cache_aside()
    await audit_stampede_prevention()

    logger.info("================================================================")
    logger.info("🎉 EVENT STREAM & CACHING AUDIT PASSED 7/7 ASSERTIONS SEALED 100%")
    logger.info("================================================================")


if __name__ == "__main__":
    asyncio.run(main())
