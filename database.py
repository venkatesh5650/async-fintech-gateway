
import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base

# 1. Load the hidden credentials from your .env file
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("CRITICAL: DATABASE_URL environment variable is missing from .env")

# 2. Architect the Asynchronous Engine
# This bypasses the Python GIL and prevents event-loop starvation
engine = create_async_engine(
    DATABASE_URL,
    echo=False,          # Toggle to 'True' later if you need to debug raw SQL queries
    pool_size=20,        # Maintains 20 perpetual background connections for instant querying
    max_overflow=10      # Allows 10 overflow connections during sudden traffic spikes
)

# 3. Establish the Session Factory
AsyncSessionLocal = async_sessionmaker(
    bind=engine, 
    expire_on_commit=False
)

# 4. Initialize the ORM Base
# We will use this in Day 10 to map Python classes to your PostgreSQL tables
Base = declarative_base()

# 5. The FastAPI Dependency Generator
# This safely yields a connection to incoming API requests and securely closes it afterward
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session