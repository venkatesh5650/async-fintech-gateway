import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

# Fail-fast on startup if routing credentials are unmapped.
if not DATABASE_URL:
    raise ValueError("CRITICAL: DATABASE_URL environment variable is missing from .env")

# Async engine with connection pooling tuned to prevent DB port exhaustion under heavy webhook load.
engine = create_async_engine(
    DATABASE_URL,
    echo=False,          
    pool_size=20,        
    max_overflow=10      
)

# expire_on_commit=False prevents implicit sync lazy-loading outside the async event loop.
AsyncSessionLocal = async_sessionmaker(
    bind=engine, 
    expire_on_commit=False
)

# Declarative ORM registry.
Base = declarative_base()

# Async context manager to guarantee deterministic connection release and prevent pool leaks.
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session