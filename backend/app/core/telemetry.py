import time
import json
import logging
from fastapi import Request
import sys
from starlette.middleware.base import BaseHTTPMiddleware

# Configure standard Python logger
logger = logging.getLogger("uvicorn.access")
logger.setLevel(logging.INFO)

class StructuredLoggingMiddleware(BaseHTTPMiddleware):
    """
    Intercepts all HTTP traffic, measures latency,
    and outputs machine-readable JSON logs for production observability.
    """
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        
        # Extract metadata
        path = request.url.path
        method = request.method
        client_ip = request.client.host if request.client else "unknown"

        # Execute the request down the event loop
        response = await call_next(request)
        
        # Calculate execution duration
        process_time_ms = round((time.time() - start_time) * 1000, 2)

        # Build structured JSON log payload
        log_payload = {
            "timestamp": time.time(),
            "client_ip": client_ip,
            "method": method,
            "path": path,
            "status_code": response.status_code,
            "latency_ms": process_time_ms,
        }

        # Bypass Uvicorn formatter bugs by writing directly to standard output
        sys.stdout.write(json.dumps(log_payload) + "\n")
        sys.stdout.flush()

        return response