from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert
from models import MarketPricing

async def upsert_market_data(session: AsyncSession, pricing_data: list[dict]):
    """
    Safely ingests high-frequency market data. 
    If a record for the exact ticker and timestamp already exists, it updates it.
    """
    
    # 1. Build the PostgreSQL-specific INSERT statement
    stmt = insert(MarketPricing).values(pricing_data)

    # 2. Define the exact behavior upon a collision (The Upsert)
    # 'excluded' refers to the new data payload we *tried* to insert
    update_dict = {
        "open_price": stmt.excluded.open_price,
        "high_price": stmt.excluded.high_price,
        "low_price": stmt.excluded.low_price,
        "close_price": stmt.excluded.close_price,
        "volume": stmt.excluded.volume
    }

    
    stmt = stmt.on_conflict_do_update(
        constraint="uix_ticker_timestamp",  # The exact string from  UniqueConstraint in models.py
        set_=update_dict
    )

    # 4. Execute asynchronously and commit the transaction
    await session.execute(stmt)
    await session.commit()