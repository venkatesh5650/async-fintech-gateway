from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
import logging
from contextlib import asynccontextmanager

from app.database.database import engine, Base
from app.core.firewall import RateLimiter
from app.routers import auth, intelligence, market  # Imported all modular routers

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Forces the cloud database to create tables if they do not exist at boot.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logging.warning("✅ [DATABASE INIT] Verified/Created all PostgreSQL tables in the cloud.")
    yield 

app = FastAPI(title="Fintech Intelligence Gateway", lifespan=lifespan)

# Mounting Enterprise Microservice Routers
app.include_router(auth.router)
app.include_router(intelligence.router)
app.include_router(market.router)

# Perimeter Defense: Rate Limiter Configuration
limiter = RateLimiter(requests_per_minute=5)

# Intercept default 422 errors to prevent internal Pydantic schema leakage
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = []
    for error in exc.errors():
        errors.append({
            "field": ".".join(str(loc) for loc in error["loc"] if loc != "body"),
            "issue": error["msg"],
            "rejected_value": error.get("input")
        })
    
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST, 
        content={
            "status": "blocked",
            "error_type": "DataFirewallViolation",
            "details": errors
        }
    )

@app.get("/health")
async def health_check():
    return {"status": "healthy", "firewall": "active", "scope": "fintech"}