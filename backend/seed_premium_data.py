import asyncio
import os
import random
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from sqlalchemy import select, delete

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.database.models import Ticker, MarketPricing

# Override connection string locally to target mapped port on localhost
DATABASE_URL = "postgresql+asyncpg://admin:admin_5650@localhost:5432/market_data"

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False)

# Dictionary of tickers and their realistic baseline starting prices for simulation
START_PRICES = {
    "AAPL": Decimal("150.00"),
    "MSFT": Decimal("320.00"),
    "GOOGL": Decimal("140.00"),
    "META": Decimal("450.00"),
    "NVDA": Decimal("95.00"),
    "AMD": Decimal("130.00"),
    "TSLA": Decimal("170.00"),
    "JPM": Decimal("160.00"),
    "GS": Decimal("380.00"),
    "MS": Decimal("85.00")
}

async def seed_premium_data():
    print("Initiating Premium Stock Ingestion Protocol (Multi-Ticker 100-Day History)...")
    
    async with AsyncSessionLocal() as session:
        async with session.begin():
            # 1. Wipe existing pricing data to prevent overlays
            print("Wiping existing price history database...")
            await session.execute(delete(MarketPricing))
            
            days_to_seed = 100
            start_date = datetime.now(timezone.utc) - timedelta(days=days_to_seed)
            
            # 2. Loop over and simulate data for each ticker in our registry
            for symbol, start_price in START_PRICES.items():
                print(f"Creating registry entry & simulating 100 days for {symbol}...")
                
                # Verify or create the ticker record
                ticker_stmt = select(Ticker).where(Ticker.symbol == symbol)
                ticker_result = await session.execute(ticker_stmt)
                ticker_obj = ticker_result.scalars().first()
                
                if not ticker_obj:
                    ticker_obj = Ticker(
                        symbol=symbol,
                        company_name=f"{symbol} Corp",
                        is_active=True
                    )
                    session.add(ticker_obj)
                    await session.flush()  # Generate foreign key ID
                
                current_close = start_price
                
                for i in range(days_to_seed):
                    candle_date = start_date + timedelta(days=i)
                    candle_timestamp = candle_date.replace(hour=16, minute=0, second=0, microsecond=0)
                    
                    open_price = current_close
                    
                    # Close price = open price * random fluctuation (-2% to +3% positive trend)
                    fluctuation = Decimal(str(random.uniform(-0.02, 0.03)))
                    close_price = open_price * (Decimal("1.0") + fluctuation)
                    
                    # High price = max of (open, close) + random wick (0.1% to 1.2%)
                    high_extension = Decimal(str(random.uniform(0.001, 0.012)))
                    high_price = max(open_price, close_price) * (Decimal("1.0") + high_extension)
                    
                    # Low price = min of (open, close) - random wick (0.1% to 1.2%)
                    low_extension = Decimal(str(random.uniform(0.001, 0.012)))
                    low_price = min(open_price, close_price) * (Decimal("1.0") - low_extension)
                    
                    # Random daily volume
                    volume = random.randint(10_000_000, 75_000_000)
                    
                    # Save reference for the next day
                    current_close = close_price
                    
                    pricing_record = MarketPricing(
                        ticker_id=ticker_obj.id,
                        timestamp=candle_timestamp,
                        open_price=round(open_price, 4),
                        high_price=round(high_price, 4),
                        low_price=round(low_price, 4),
                        close_price=round(close_price, 4),
                        volume=volume
                    )
                    session.add(pricing_record)
            
            print("Committing multi-ticker premium OHLC records to PostgreSQL storage...")
        await session.commit()
    
    print("Database seeding completed successfully for all tickers. Verification ready.")

if __name__ == "__main__":
    asyncio.run(seed_premium_data())
