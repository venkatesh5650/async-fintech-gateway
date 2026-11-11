import time
import json
import base64
import uuid
import redis.asyncio as redis
from fastapi import HTTPException, Request, status
import os

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
if "redis://redis:" in REDIS_URL and not os.path.exists("/.dockerenv"):
    REDIS_URL = REDIS_URL.replace("redis://redis:", "redis://localhost:")
limiter_redis = redis.from_url(REDIS_URL, decode_responses=True)


def _client_bucket(request: Request) -> str:
    """
    Bucket by authenticated user when the BFF sends Bearer JWT.
    TCP peer IP is the Next.js server for every desk user, so using
    request.client.host alone makes the whole app share one 5/min quota.
    """
    auth = request.headers.get("Authorization") or ""
    if auth.lower().startswith("bearer "):
        token = auth.split(" ", 1)[1].strip()
        try:
            payload_b64 = token.split(".")[1]
            padded = payload_b64 + "=" * (-len(payload_b64) % 4)
            payload = json.loads(base64.urlsafe_b64decode(padded))
            sub = payload.get("sub") or payload.get("email")
            if sub:
                return f"user:{sub}"
        except Exception:
            pass

    forwarded = (request.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
    if forwarded:
        return f"ip:{forwarded}"

    host = request.client.host if request.client else "unknown_client"
    return f"ip:{host}"


class RateLimiter:
    def __init__(self, requests_per_minute: int = 5):
        self.rpm = requests_per_minute
        self.window = 60

    async def __call__(self, request: Request):
        current_time = time.time()
        redis_key = f"rate_limit:{_client_bucket(request)}"

        async with limiter_redis.pipeline() as pipe:
            try:
                # 1. Clean up old entries outside the sliding window
                pipe.zremrangebyscore(redis_key, 0, current_time - self.window)
                # 2. Count current valid requests
                pipe.zcard(redis_key)
                # 3. Refresh TTL
                pipe.expire(redis_key, self.window)

                _, current_count, _ = await pipe.execute()

                # 4. If limit is already reached, block immediately WITHOUT adding the new timestamp
                if current_count >= self.rpm:
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail={
                            "status": "blocked",
                            "error_type": "RateLimitExceeded",
                            "message": f"Security Threshold Breached. Maximum {self.rpm} requests per minute allowed.",
                        },
                        headers={"Retry-After": str(self.window)},
                    )

                await limiter_redis.zadd(redis_key, {f"{current_time}:{uuid.uuid4().hex}": current_time})

            except redis.RedisError as e:
                # Fail-open pattern: Log error but allow traffic if Redis drops
                print(f"⚠️ [FIREWALL WARNING] Redis rate-limiter failed: {str(e)}")
