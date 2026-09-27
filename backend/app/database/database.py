import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("CRITICAL: DATABASE_URL environment variable is missing from environment")

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("postgresql://") and not DATABASE_URL.startswith("postgresql+asyncpg://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

if "@db:" in DATABASE_URL and not os.path.exists("/.dockerenv"):
    DATABASE_URL = DATABASE_URL.replace("@db:", "@localhost:")

connect_args = {}
if not any(local_host in DATABASE_URL for local_host in ["localhost", "@db:", "127.0.0.1"]):
    import ssl
    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE
    connect_args["ssl"] = ssl_ctx

engine = create_async_engine(
    DATABASE_URL,
    connect_args=connect_args,
    echo=False,          
    pool_size=20,        
    max_overflow=10      
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine, 
    expire_on_commit=False
)

Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session