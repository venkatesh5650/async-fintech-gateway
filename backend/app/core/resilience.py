import asyncio
import logging
import random
import time
from enum import Enum
from functools import wraps
from typing import Any, Dict, Optional

logger = logging.getLogger("uvicorn.error")


def async_retry(retries: int = 3, delay: float = 1.0, backoff: float = 2.0):
    """
    Exponential Backoff Retry Decorator.
    Protects data fetching operations from transient third-party API outages.
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            current_delay = delay
            last_exception = None

            for attempt in range(1, retries + 1):
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    last_exception = e
                    logger.warning(
                        f"⚠️ [MARKET API RETRY {attempt}/{retries}] Function '{func.__name__}' failed: {str(e)}. Retrying in {current_delay}s..."
                    )
                    await asyncio.sleep(current_delay)
                    current_delay *= backoff

            logger.error(f"❌ [CRITICAL] Market data fetcher '{func.__name__}' failed permanently after {retries} retries.")
            if last_exception is not None:
                raise last_exception
            raise RuntimeError(f"Operation '{func.__name__}' failed permanently after {retries} retries.")
        return wrapper
    return decorator


# ======================================================================
# RATE-LIMIT RESILIENCE ENGINE: CIRCUIT BREAKER & JITTERED BACKOFF
# ======================================================================

class CircuitState(str, Enum):
    CLOSED = "CLOSED"       # Normal operation; all requests allowed through
    OPEN = "OPEN"           # Throttled/tripped; requests fast-rejected or paused
    HALF_OPEN = "HALF_OPEN" # Cooldown elapsed; canary trial request permitted


def is_rate_limit_error(exc: Exception) -> bool:
    """
    Evaluates whether an exception indicates an HTTP 429 Too Many Requests
    or downstream LLM rate-limit quota exhaustion.
    """
    if exc is None:
        return False

    # Check explicit HTTP status code attributes (Groq, OpenAI, httpx, etc.)
    status_code = getattr(exc, "status_code", None) or getattr(exc, "code", None)
    if status_code == 429:
        return True

    # Check exception type name
    type_name = type(exc).__name__.lower()
    if "ratelimit" in type_name or "rate_limit" in type_name:
        return True

    # Check string representation
    exc_str = str(exc).lower()
    indicators = [
        "429",
        "rate limit",
        "rate_limit",
        "rate_limit_exceeded",
        "too many requests",
        "tokens per minute",
        "requests per minute",
        "tpm",
        "rpm",
    ]
    return any(ind in exc_str for ind in indicators)


def calculate_backoff_with_jitter(
    attempt: int,
    base_delay: float = 2.0,
    max_delay: float = 30.0,
    jitter: bool = True,
) -> float:
    """
    AWS Full-Jitter Exponential Backoff Calculation.
    T = min(max_delay, base_delay * 2^attempt)
    If jitter is True, returns random uniform in [base_delay * 0.5, T] to eliminate
    thundering herd retry synchronization across concurrent consumers.
    """
    exponential = min(max_delay, base_delay * (2 ** max(0, attempt)))
    if not jitter:
        return round(exponential, 3)

    low_bound = max(0.2, base_delay * 0.5)
    return round(random.uniform(low_bound, max(low_bound, exponential)), 3)


class GroqLLMCircuitBreaker:
    """
    Circuit Breaker pattern specifically protecting the Groq LLM cluster.
    
    States:
      - CLOSED: Calls proceed normally.
      - OPEN: Tripped by repeated rate-limit / 429 responses. Fast-blocks
              calls for cooldown_period_sec to allow Groq quota recovery.
      - HALF_OPEN: Cooldown expired. Allows a single canary trial to test
                   upstream responsiveness before fully reopening.
    """

    def __init__(
        self,
        failure_threshold: int = 2,
        cooldown_period_sec: float = 20.0,
        half_open_max_trials: int = 1,
    ):
        self.failure_threshold = failure_threshold
        self.cooldown_period_sec = cooldown_period_sec
        self.half_open_max_trials = half_open_max_trials

        self.state: CircuitState = CircuitState.CLOSED
        self.consecutive_rate_limits: int = 0
        self.total_trips: int = 0
        self.trip_timestamp: float = 0.0
        self.last_failure_reason: str = ""
        self.half_open_trials_active: int = 0

    def can_execute(self) -> bool:
        """
        Determines whether an LLM execution should be allowed to proceed.
        Handles automated state transition from OPEN to HALF_OPEN after cooldown.
        """
        if self.state == CircuitState.CLOSED:
            return True

        now = time.time()
        if self.state == CircuitState.OPEN:
            elapsed = now - self.trip_timestamp
            if elapsed >= self.cooldown_period_sec:
                self.state = CircuitState.HALF_OPEN
                self.half_open_trials_active = 1
                logger.info(
                    f"🟡 [CIRCUIT BREAKER] Cooldown {self.cooldown_period_sec}s elapsed. "
                    "Entering HALF_OPEN state (canary trial enabled)."
                )
                return True
            return False

        if self.state == CircuitState.HALF_OPEN:
            if self.half_open_trials_active < self.half_open_max_trials:
                self.half_open_trials_active += 1
                return True
            return False

        return False

    def record_success(self) -> None:
        """
        Registers a successful LLM invocation.
        If in HALF_OPEN state, restores the circuit to CLOSED.
        """
        if self.state == CircuitState.HALF_OPEN:
            logger.info("🟢 [CIRCUIT BREAKER] Canary trial succeeded. Circuit restored to CLOSED.")
        self.state = CircuitState.CLOSED
        self.consecutive_rate_limits = 0
        self.half_open_trials_active = 0
        self.last_failure_reason = ""

    def record_failure(self, exc: Any, is_rate_limit: bool = True) -> None:
        """
        Registers an execution failure.
        Trips the circuit to OPEN if consecutive rate-limit threshold is met
        or if a canary trial in HALF_OPEN fails.
        """
        self.last_failure_reason = str(exc)

        if is_rate_limit:
            self.consecutive_rate_limits += 1
            if (
                self.consecutive_rate_limits >= self.failure_threshold
                or self.state == CircuitState.HALF_OPEN
            ):
                self.state = CircuitState.OPEN
                self.trip_timestamp = time.time()
                self.total_trips += 1
                self.half_open_trials_active = 0
                logger.warning(
                    f"🔴 [CIRCUIT BREAKER] Tripped to OPEN! "
                    f"({self.consecutive_rate_limits} consecutive rate limits). "
                    f"Fast-blocking LLM calls for {self.cooldown_period_sec}s cooldown."
                )

    def get_cooldown_remaining(self) -> float:
        """Returns the number of seconds remaining in OPEN state cooldown."""
        if self.state != CircuitState.OPEN:
            return 0.0
        elapsed = time.time() - self.trip_timestamp
        return max(0.0, round(self.cooldown_period_sec - elapsed, 2))

    def get_state_snapshot(self) -> Dict[str, Any]:
        """Provides a telemetry snapshot for CQRS observability endpoints."""
        return {
            "circuit_state": self.state.value,
            "consecutive_rate_limits": self.consecutive_rate_limits,
            "failure_threshold": self.failure_threshold,
            "total_trips": self.total_trips,
            "cooldown_period_sec": self.cooldown_period_sec,
            "cooldown_remaining_sec": self.get_cooldown_remaining(),
            "last_failure_reason": self.last_failure_reason,
            "server_timestamp_ms": int(time.time() * 1000),
        }

    def reset(self) -> None:
        """Resets the circuit breaker to clean initial state (for test suites)."""
        self.state = CircuitState.CLOSED
        self.consecutive_rate_limits = 0
        self.total_trips = 0
        self.trip_timestamp = 0.0
        self.last_failure_reason = ""
        self.half_open_trials_active = 0


# Global singleton instance for the worker and API processes
groq_circuit_breaker = GroqLLMCircuitBreaker()