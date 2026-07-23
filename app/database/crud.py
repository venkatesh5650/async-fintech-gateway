from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert
from app.models import MarketPricing

async def upsert_market_data(session: AsyncSession, pricing_data: list[dict]):
    """
    Idempotent time-series ingestion handler. 
    Guarantees exactly-once write semantics during high-frequency webhook retries or concurrent backfills.
    """
    
    # Utilizing native PostgreSQL ON CONFLICT for atomic upserts.
    # This completely bypasses ORM read-modify-write race conditions under heavy concurrent load.
    stmt = insert(MarketPricing).values(pricing_data)

    update_dict = {
        "open_price": stmt.excluded.open_price,
        "high_price": stmt.excluded.high_price,
        "low_price": stmt.excluded.low_price,
        "close_price": stmt.excluded.close_price,
        "volume": stmt.excluded.volume
    }
    
    stmt = stmt.on_conflict_do_update(
        constraint="uix_ticker_timestamp", 
        set_=update_dict
    )

    await session.execute(stmt)
    await session.commit()