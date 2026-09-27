import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("CRITICAL: DATABASE_URL environment variable is missing from environment")

# Normalise scheme to asyncpg driver
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("postgresql://") and "+asyncpg" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# Local dev: rewrite internal Docker hostname to localhost
if "@db:" in DATABASE_URL and not os.path.exists("/.dockerenv"):
    DATABASE_URL = DATABASE_URL.replace("@db:", "@localhost:")

# Detect whether we are connecting to a remote cloud database (not local)
_LOCAL_HOSTS = ("localhost", "@db:", "127.0.0.1", "@postgres:", "@fintech_postgres:")
_is_cloud_db = not any(h in DATABASE_URL for h in _LOCAL_HOSTS)

# asyncpg understands the string "require" natively — do NOT pass ssl.SSLContext
# (SSLContext causes asyncpg to close the connection mid-handshake)
connect_args: dict = {"ssl": "require"} if _is_cloud_db else {}

# Free-tier Render PostgreSQL has a hard limit of 25 max connections.
# pool_size=5 + max_overflow=5 gives headroom for the ASGI event loop.
_pool_size = 5 if _is_cloud_db else 20
_max_overflow = 5 if _is_cloud_db else 10

engine = create_async_engine(
    DATABASE_URL,
    connect_args=connect_args,
    echo=False,
    pool_size=_pool_size,
    max_overflow=_max_overflow,
    pool_pre_ping=True,      # Drop stale connections before use
    pool_recycle=300,        # Recycle connections every 5 min to avoid server-side timeouts
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
)

Base = declarative_base()


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session