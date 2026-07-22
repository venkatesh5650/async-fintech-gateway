import time
import redis.asyncio as redis
from fastapi import HTTPException, Request, status
import os

# Initialize a dedicated Redis connection for the firewall perimeter
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
limiter_redis = redis.from_url(REDIS_URL, decode_responses=True)

class RateLimiter:
    def __init__(self, requests_per_minute: int = 5):
        self.rpm = requests_per_minute
        self.window = 60  # 60 seconds sliding window

    async def __call__(self, request: Request):
        # Extract the client's IP address as the unique identifier
        client_ip = request.client.host if request.client else "unknown_client"
        current_time = time.time()
        
        # Redis key structured strictly by namespace and client IP
        redis_key = f"rate_limit:{client_ip}"
        
        async with limiter_redis.pipeline() as pipe:
            try:
                # 1. Clean up old timestamps outside the 60-second window
                pipe.zremrangebyscore(redis_key, 0, current_time - self.window)
                
                # 2. Count current valid requests in the window
                pipe.zcard(redis_key)
                
                # 3. Add the current request timestamp
                pipe.zadd(redis_key, {str(current_time): current_time})
                
                # 4. Set an expiration on the key so it cleans itself up (TTL = window size)
                pipe.expire(redis_key, self.window)
                
                _, current_requests, _, _ = await pipe.execute()
                
                # If requests exceed the limit, block the attacker immediately
                if current_requests >= self.rpm:
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail={
                            "status": "blocked",
                            "error_type": "RateLimitExceeded",
                            "message": f"Security Threshold Breached. Maximum {self.rpm} requests per minute allowed."
                        }
                    )
            except redis.RedisError as e:
                # Fail-open safety: If Redis crashes, don't take down the whole app, but log it
                print(f"⚠️ [FIREWALL WARNING] Redis rate-limiter failed: {str(e)}")