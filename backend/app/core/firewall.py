import time
import redis.asyncio as redis
from fastapi import HTTPException, Request, status
import os

# Initialize Redis connection for rate limiting
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
limiter_redis = redis.from_url(REDIS_URL, decode_responses=True)

class RateLimiter:
    def __init__(self, requests_per_minute: int = 5):
        self.rpm = requests_per_minute
        self.window = 60  # Sliding window duration in seconds

    async def __call__(self, request: Request):
        # Extract client IP for identifier
        client_ip = request.client.host if request.client else "unknown_client"
        current_time = time.time()
        
        # Format Redis key with namespace and client IP
        redis_key = f"rate_limit:{client_ip}"
        
        async with limiter_redis.pipeline() as pipe:
            try:
                # Remove timestamps outside the sliding window
                pipe.zremrangebyscore(redis_key, 0, current_time - self.window)
                
                # Count valid requests within the current window
                pipe.zcard(redis_key)
                
                # Add current request timestamp
                pipe.zadd(redis_key, {str(current_time): current_time})
                
                # Set key expiration (TTL)
                pipe.expire(redis_key, self.window)
                
                _, current_requests, _, _ = await pipe.execute()
                
                # Block request if limit is exceeded
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
                # Fail-open on Redis connection error
                print(f"⚠️ [FIREWALL WARNING] Redis rate-limiter failed: {str(e)}")