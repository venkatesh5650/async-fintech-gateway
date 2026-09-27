import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("CRITICAL: DATABASE_URL environment variable is missing from environment")

# Normalise scheme so SQLAlchemy uses the asyncpg driver
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("postgresql://") and "+asyncpg" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# Local dev: rewrite internal Docker/Compose hostname to localhost
if "@db:" in DATABASE_URL and not os.path.exists("/.dockerenv"):
    DATABASE_URL = DATABASE_URL.replace("@db:", "@localhost:")

# Detect whether we are connecting to a remote cloud database
_LOCAL_HOSTS = ("localhost", "@db:", "127.0.0.1", "@postgres:", "@fintech_postgres:")
_is_cloud_db = not any(h in DATABASE_URL for h in _LOCAL_HOSTS)

# ── SSL strategy ─────────────────────────────────────────────────────────────
# SQLAlchemy 2.0 + asyncpg 0.31 does NOT reliably forward connect_args["ssl"]
# to asyncpg. The only 100% reliable method is to embed ssl=require directly
# in the URL query string — asyncpg's own URL parser handles it before
# SQLAlchemy's dialect layer can intercept or drop it.
if _is_cloud_db and "ssl=" not in DATABASE_URL:
    DATABASE_URL += "?ssl=require" if "?" not in DATABASE_URL else "&ssl=require"

# Pool sizing: Render free-tier PostgreSQL hard-caps at 25 total connections.
_pool_size = 5 if _is_cloud_db else 20
_max_overflow = 5 if _is_cloud_db else 10

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_size=_pool_size,
    max_overflow=_max_overflow,
    pool_pre_ping=True,    # evict stale connections before checkout
    pool_recycle=300,      # recycle every 5 min to avoid server-side idle timeout
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
)

Base = declarative_base()


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
