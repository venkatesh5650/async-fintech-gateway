import asyncio
import logging
from functools import wraps

logger = logging.getLogger("uvicorn.error")

def async_retry(retries: int = 3, delay: float = 1.0, backoff: float = 2.0):
    """
    1% Architect Pattern: Exponential Backoff Retry Decorator.
    Protects equity data fetching loops from transient third-party API outages.
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
            raise last_exception
        return wrapper
    return decorator