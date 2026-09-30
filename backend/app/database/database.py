import os
import ssl as _ssl_module
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

# Strip any ssl= query params from URL — asyncpg handles SSL via connect_args,
# not URL query strings. Mixing both causes "connection closed mid-operation".
import re

DATABASE_URL = re.sub(r"[?&]ssl(mode)?=[^&]*", "", DATABASE_URL)
# Clean up any trailing ? or & left after removal
DATABASE_URL = re.sub(r"[?&]$", "", DATABASE_URL)

# Local dev: rewrite internal Docker/Compose hostname to localhost.
# On Render, /.dockerenv exists but DATABASE_URL will be the Render internal URL
# (not @db:), so this block only runs for local Docker Compose setups.
if "@db:" in DATABASE_URL and not os.path.exists("/.dockerenv"):
    DATABASE_URL = DATABASE_URL.replace("@db:", "@localhost:")

# Detect whether we are connecting to a remote cloud database
_LOCAL_HOSTS = ("localhost", "@db:", "127.0.0.1", "@postgres:", "@fintech_postgres:")
_is_cloud_db = not any(h in DATABASE_URL for h in _LOCAL_HOSTS)

# ── SSL strategy ─────────────────────────────────────────────────────────────
# asyncpg requires SSL to be passed as an ssl.SSLContext (or the string "require")
# via connect_args. URL query-string ssl= is NOT reliably respected by asyncpg
# when used through SQLAlchemy — it causes "connection closed in the middle of
# operation" because the SSL negotiation is attempted at the wrong layer.
_connect_args: dict = {}
if _is_cloud_db:
    # Create a permissive SSL context that trusts the server certificate
    # via the system CA bundle (works with Render, Supabase, Neon, etc.)
    ssl_ctx = _ssl_module.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = _ssl_module.CERT_NONE  # Render self-signed certs
    _connect_args["ssl"] = ssl_ctx

# Pool sizing: Render free-tier PostgreSQL hard-caps at 25 total connections.
_pool_size = 5 if _is_cloud_db else 20
_max_overflow = 5 if _is_cloud_db else 10

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_size=_pool_size,
    max_overflow=_max_overflow,
    pool_pre_ping=True,  # evict stale connections before checkout
    pool_recycle=300,  # recycle every 5 min to avoid server-side idle timeout
    connect_args=_connect_args,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
)

Base = declarative_base()


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
