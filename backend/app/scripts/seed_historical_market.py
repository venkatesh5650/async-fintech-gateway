import sys
import os
import asyncio
import yfinance as yf
from decimal import Decimal
from datetime import datetime, timezone
from sqlalchemy.dialects.postgresql import insert as pg_insert

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.database.database import AsyncSessionLocal
from app.database.models import Ticker, MarketPricing

TICKERS = ["AAPL", "MSFT", "NVDA", "TSLA", "GOOGL"]

async def seed_historical_data():
    async with AsyncSessionLocal() as session:
        for symbol in TICKERS:
            # Fetch 60 days of daily historical bars from yfinance
            t = yf.Ticker(symbol)
            hist = t.history(period="60d")
            if hist.empty:
                continue

            # Ensure ticker exists
            res = await session.execute(
                Ticker.__table__.select().where(Ticker.symbol == symbol)
            )
            row = res.fetchone()
            if not row:
                res_ins = await session.execute(
                    Ticker.__table__.insert().values(symbol=symbol, company_name=f"{symbol} Corp")
                )
                ticker_id = res_ins.inserted_primary_key[0]
            else:
                ticker_id = row[0]

            pricing_rows = []
            for idx, r in hist.iterrows():
                dt = idx.to_pydatetime()
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                else:
                    dt = dt.astimezone(timezone.utc)

                pricing_rows.append({
                    "ticker_id": ticker_id,
                    "timestamp": dt,
                    "open_price": Decimal(str(round(float(r["Open"]), 4))),
                    "high_price": Decimal(str(round(float(r["High"]), 4))),
                    "low_price": Decimal(str(round(float(r["Low"]), 4))),
                    "close_price": Decimal(str(round(float(r["Close"]), 4))),
                    "volume": int(r["Volume"])
                })

            for p in pricing_rows:
                stmt = pg_insert(MarketPricing).values(**p).on_conflict_do_update(
                    constraint="uix_ticker_timestamp",
                    set_={
                        "open_price": p["open_price"],
                        "high_price": p["high_price"],
                        "low_price": p["low_price"],
                        "close_price": p["close_price"],
                        "volume": p["volume"]
                    }
                )
                await session.execute(stmt)
            
            print(f"✅ [SEED] Seeded {len(pricing_rows)} daily historical bars for {symbol}")
        await session.commit()

if __name__ == "__main__":
    asyncio.run(seed_historical_data())
