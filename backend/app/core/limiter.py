import time
import redis.asyncio as redis
from fastapi import HTTPException, Request, status
import os

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
limiter_redis = redis.from_url(REDIS_URL, decode_responses=True)

class RateLimiter:
    def __init__(self, requests_per_minute: int = 5):
        self.rpm = requests_per_minute
        self.window = 60

    async def __call__(self, request: Request):
        client_ip = request.client.host if request.client else "unknown_client"
        current_time = time.time()
        redis_key = f"rate_limit:{client_ip}"
        
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
                            "message": f"Security Threshold Breached. Maximum {self.rpm} requests per minute allowed."
                        },
                        headers={"Retry-After": str(self.window)}
                    )
                
                # 5. If allowed, add the current request timestamp
                await limiter_redis.zadd(redis_key, {str(current_time): current_time})

            except redis.RedisError as e:
                # Fail-open pattern: Log error but allow traffic if Redis drops
                print(f"⚠️ [FIREWALL WARNING] Redis rate-limiter failed: {str(e)}")