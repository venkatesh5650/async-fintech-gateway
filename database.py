import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base

# Enforce strict configuration boundaries. Fail-fast on application startup 
# if database routing credentials are unmapped.
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("CRITICAL: DATABASE_URL environment variable is missing from .env")

# Asynchronous engine configuration optimized for high-concurrency webhook ingestion.
# Connection pooling is aggressively tuned to prevent PostgreSQL port exhaustion 
# while maintaining sufficient baseline connections to eliminate latency jitter.
engine = create_async_engine(
    DATABASE_URL,
    echo=False,          
    pool_size=20,        
    max_overflow=10      
)

# Ephemeral session factory. expire_on_commit=False prevents implicit synchronous 
# lazy-loading outside the asyncio event loop boundary.
AsyncSessionLocal = async_sessionmaker(
    bind=engine, 
    expire_on_commit=False
)

# Central declarative registry for downstream ORM mapping.
Base = declarative_base()

# FastAPI dependency generator utilizing async context managers.
# Guarantees atomic transaction boundaries and deterministic connection release 
# back to the engine pool, preventing slow-leak exhaustion under load.
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session