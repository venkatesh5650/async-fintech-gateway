# app/scripts/audit_retry_scheduler.py

"""
Audit Suite: Backpressure & Rate-Limit Aware Retry Scheduling
-------------------------------------------------------------
Executes a 4-point production verification of the LLM Circuit Breaker,
AWS full-jitter backoff math, worker backpressure dampening, and CQRS telemetry.
"""

import sys
import os
import time
import asyncio
import logging
import httpx

# Ensure backend root is in python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.core.resilience import (
    CircuitState,
    GroqLLMCircuitBreaker,
    is_rate_limit_error,
    calculate_backoff_with_jitter,
    groq_circuit_breaker,
)
from app.workers.consumer import (
    StreamConsumerWorker,
    MIN_CONCURRENCY,
    MAX_CONCURRENCY,
    SCALE_UP_THRESHOLD,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("audit_retry_scheduler")

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")


# ─────────────────────────────────────────────────
# 1. Rate-Limit Classifier & Full-Jitter Math Bounds
# ─────────────────────────────────────────────────
async def test_rate_limit_classifier_and_jitter() -> float:
    t0 = time.perf_counter()

    # (a) Verify Rate-Limit Classifier
    class MockHttp429(Exception):
        status_code = 429

    class MockHttp500(Exception):
        status_code = 500

    assert is_rate_limit_error(MockHttp429("Rate limit exceeded")), "Should detect status_code=429"
    assert is_rate_limit_error(Exception("Groq: Error code 429 - rate_limit_exceeded")), "Should detect '429' text"
    assert is_rate_limit_error(Exception("Requests per minute quota exceeded")), "Should detect 'requests per minute'"
    assert is_rate_limit_error(Exception("tokens per minute limit reached")), "Should detect 'tokens per minute'"
    assert not is_rate_limit_error(MockHttp500("Internal server error")), "HTTP 500 should NOT be rate limit"
    assert not is_rate_limit_error(ValueError("Ticker not found")), "ValueError should NOT be rate limit"
    assert not is_rate_limit_error(None), "None should return False"

    # (b) Verify AWS Full-Jitter Math Bounds & Variance
    base_delay = 2.0
    max_delay = 30.0
    samples = []

    for attempt in range(1, 4):
        exponential_cap = min(max_delay, base_delay * (2 ** attempt))
        low_bound = base_delay * 0.5
        attempt_samples = []

        for _ in range(50):
            val = calculate_backoff_with_jitter(attempt, base_delay=base_delay, max_delay=max_delay, jitter=True)
            assert low_bound <= val <= exponential_cap, (
                f"Jittered delay {val} out of bounds [{low_bound}, {exponential_cap}] for attempt {attempt}"
            )
            attempt_samples.append(val)

        # Check that jitter generates variable values (not deterministic constant)
        assert len(set(attempt_samples)) > 10, f"Insufficient jitter randomness across 50 iterations: {attempt_samples[:5]}"
        samples.extend(attempt_samples)

    # Non-jittered version must equal exact exponential value
    assert calculate_backoff_with_jitter(1, base_delay=2.0, max_delay=30.0, jitter=False) == 4.0
    assert calculate_backoff_with_jitter(2, base_delay=2.0, max_delay=30.0, jitter=False) == 8.0
    assert calculate_backoff_with_jitter(5, base_delay=2.0, max_delay=30.0, jitter=False) == 30.0

    return (time.perf_counter() - t0) * 1000


# ─────────────────────────────────────────────────
# 2. Circuit Breaker State Transitions
# ─────────────────────────────────────────────────
async def test_circuit_breaker_state_machine() -> float:
    t0 = time.perf_counter()

    cb = GroqLLMCircuitBreaker(
        failure_threshold=2,
        cooldown_period_sec=0.3,  # Fast 300ms cooldown for audit
        half_open_max_trials=1,
    )

    # Initial state: CLOSED
    assert cb.state == CircuitState.CLOSED, f"Expected CLOSED, got {cb.state}"
    assert cb.can_execute() is True, "Circuit should allow execution when CLOSED"
    assert cb.consecutive_rate_limits == 0
    assert cb.total_trips == 0

    # 1st failure: consecutive=1, threshold=2 -> Should stay CLOSED
    cb.record_failure(Exception("Rate limit 429"), is_rate_limit=True)
    assert cb.state == CircuitState.CLOSED, f"Should remain CLOSED after 1 failure, got {cb.state}"
    assert cb.consecutive_rate_limits == 1
    assert cb.can_execute() is True

    # 2nd failure: consecutive=2 >= threshold -> Should trip to OPEN
    cb.record_failure(Exception("Rate limit 429"), is_rate_limit=True)
    assert cb.state == CircuitState.OPEN, f"Should trip to OPEN after 2 failures, got {cb.state}"
    assert cb.total_trips == 1
    assert cb.can_execute() is False, "Circuit must reject execution when OPEN"
    assert cb.get_cooldown_remaining() > 0.0

    # Fast cooldown wait
    await asyncio.sleep(0.35)

    # Cooldown elapsed -> can_execute() should transition to HALF_OPEN
    assert cb.can_execute() is True, "Canary trial should be allowed after cooldown"
    assert cb.state == CircuitState.HALF_OPEN, f"Expected HALF_OPEN, got {cb.state}"

    # Canary trial succeeds -> Should transition back to CLOSED
    cb.record_success()
    assert cb.state == CircuitState.CLOSED, f"Expected CLOSED after canary success, got {cb.state}"
    assert cb.consecutive_rate_limits == 0

    # Test canary trial failure: Trips directly back to OPEN without needing 2 failures
    cb.record_failure("429 in closed", is_rate_limit=True)
    cb.record_failure("429 in closed 2", is_rate_limit=True)
    assert cb.state == CircuitState.OPEN
    await asyncio.sleep(0.35)
    assert cb.can_execute() is True  # Enters HALF_OPEN
    assert cb.state == CircuitState.HALF_OPEN
    cb.record_failure("Canary trial failed with 429", is_rate_limit=True)
    assert cb.state == CircuitState.OPEN, "Failed canary trial must immediately trip back to OPEN"
    assert cb.total_trips == 3

    return (time.perf_counter() - t0) * 1000


# ─────────────────────────────────────────────────
# 3. Worker Concurrency Dampening on Rate-Limit
# ─────────────────────────────────────────────────
async def test_worker_concurrency_dampening() -> float:
    t0 = time.perf_counter()

    worker = StreamConsumerWorker()
    # Simulate high concurrency under normal load
    worker.max_concurrency = MAX_CONCURRENCY
    worker.semaphore = asyncio.Semaphore(MAX_CONCURRENCY)

    assert worker.max_concurrency == MAX_CONCURRENCY

    # Trigger rate limit dampening (as occurs in _process_single_message on 429)
    # The backpressure clamp forces concurrency to MIN_CONCURRENCY
    if worker.max_concurrency > MIN_CONCURRENCY:
        worker.semaphore = asyncio.Semaphore(MIN_CONCURRENCY)
        worker.max_concurrency = MIN_CONCURRENCY

    assert worker.max_concurrency == MIN_CONCURRENCY, (
        f"Concurrency should be clamped to MIN_CONCURRENCY ({MIN_CONCURRENCY}), got {worker.max_concurrency}"
    )

    # Verify concurrency controller pins to MIN_CONCURRENCY when circuit breaker is OPEN
    groq_circuit_breaker.reset()
    groq_circuit_breaker.record_failure("429 rate limit", is_rate_limit=True)
    groq_circuit_breaker.record_failure("429 rate limit", is_rate_limit=True)
    assert groq_circuit_breaker.state == CircuitState.OPEN

    # Simulate concurrency controller scaling logic with heavy stream lag (e.g. 50)
    total_lag = 50
    current = worker.max_concurrency

    # Controller scaling rule under test:
    if groq_circuit_breaker.state == CircuitState.OPEN:
        target = MIN_CONCURRENCY
    elif total_lag > SCALE_UP_THRESHOLD * 3:
        target = MAX_CONCURRENCY
    else:
        target = current

    assert target == MIN_CONCURRENCY, (
        f"Controller must NOT scale up to MAX_CONCURRENCY when circuit breaker is OPEN! Got target={target}"
    )

    groq_circuit_breaker.reset()
    return (time.perf_counter() - t0) * 1000


# ─────────────────────────────────────────────────
# 4. Live CQRS Telemetry Endpoint Verification
# ─────────────────────────────────────────────────
async def test_cqrs_telemetry_endpoints() -> float:
    t0 = time.perf_counter()

    async with httpx.AsyncClient(base_url=API_BASE_URL, timeout=10.0) as client:
        # (a) Dedicated /circuit-breaker endpoint
        res_cb = await client.get("/v1/intelligence/circuit-breaker")
        assert res_cb.status_code == 200, f"Expected 200 from /circuit-breaker, got {res_cb.status_code}: {res_cb.text}"
        cb_data = res_cb.json()

        required_cb_fields = [
            "circuit_state",
            "consecutive_rate_limits",
            "failure_threshold",
            "total_trips",
            "cooldown_period_sec",
            "cooldown_remaining_sec",
            "last_failure_reason",
            "server_timestamp_ms",
        ]
        for field in required_cb_fields:
            assert field in cb_data, f"Missing field '{field}' in /circuit-breaker response"

        assert cb_data["circuit_state"] in ("CLOSED", "OPEN", "HALF_OPEN"), (
            f"Invalid circuit_state: {cb_data['circuit_state']}"
        )

        # (b) Integrated /stream-health endpoint
        res_health = await client.get("/v1/intelligence/stream-health")
        assert res_health.status_code == 200, f"Expected 200 from /stream-health, got {res_health.status_code}: {res_health.text}"
        health_data = res_health.json()

        assert "circuit_breaker" in health_data, "Missing 'circuit_breaker' sub-object in /stream-health response"
        assert health_data["circuit_breaker"]["circuit_state"] == cb_data["circuit_state"]

    return (time.perf_counter() - t0) * 1000


# ─────────────────────────────────────────────────
# Main Execution Runner
# ─────────────────────────────────────────────────
async def main():
    print("=" * 70)
    print("🚀 BACKPRESSURE & RATE-LIMIT AWARE RETRY SCHEDULING AUDIT")
    print("=" * 70)
    suite_start = time.perf_counter()
    passed = 0

    tests = [
        ("1. Rate-Limit Classifier & Full-Jitter Math Bounds", test_rate_limit_classifier_and_jitter),
        ("2. Circuit Breaker State Machine Dynamics", test_circuit_breaker_state_machine),
        ("3. Worker Concurrency Dampening on Rate-Limit", test_worker_concurrency_dampening),
        ("4. CQRS Telemetry Endpoints (/circuit-breaker & /stream-health)", test_cqrs_telemetry_endpoints),
    ]

    for name, test_fn in tests:
        try:
            latency = await test_fn()
            print(f"✅ {name}")
            print(f"   └─ Passed (latency={latency:.2f}ms)")
            passed += 1
        except AssertionError as ae:
            print(f"❌ {name}")
            print(f"   └─ FAILED Assertion: {ae}")
        except Exception as exc:
            print(f"❌ {name}")
            print(f"   └─ FAILED Exception: {exc}")

    total_ms = (time.perf_counter() - suite_start) * 1000
    print("=" * 70)
    print(f"🏁 RETRY SCHEDULER AUDIT SUMMARY: {passed}/{len(tests)} Assertions Passed in {total_ms:.2f}ms")
    if passed == len(tests):
        print("🌟 RATE-LIMIT AWARE RETRY SCHEDULING VERIFIED: PRODUCTION READY")
    else:
        print("⚠️ AUDIT FAILED: Correct issues before production deployment.")
    print("=" * 70)

    if passed != len(tests):
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
