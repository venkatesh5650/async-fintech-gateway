import os
import asyncio
import asyncpg
from langchain_core.tools import tool
from pydantic import BaseModel, Field
from sqlalchemy import select

from database import get_db
from models import MarketPricing, Ticker

# ==========================================
# PRIMARY STRATEGY (TECHNICAL / RELATIONAL)
# ==========================================
class PriceHistoryInput(BaseModel):
    ticker: str = Field(..., description="The stock ticker symbol, e.g., 'AAPL' or 'NVDA'")
    days_back: int = Field(default=50, description="How many days of historical data to retrieve")

@tool("get_historical_prices", args_schema=PriceHistoryInput)
def get_historical_prices(ticker: str, days_back: int) -> dict:
    """
    Fetches the actual historical pricing data from the PostgreSQL time-series database.
    Use this tool whenever you need to evaluate the moving averages or momentum of an asset.
    """
    print(f"\n[TOOL EXECUTING] 🛠️ Agent invoked get_historical_prices for {ticker} (Last {days_back} days)")
    
    async def fetch_live_data():
        async for session in get_db():
            ticker_query = select(Ticker).where(Ticker.symbol == ticker)
            result = await session.execute(ticker_query)
            target_ticker = result.scalar_one_or_none()
            
            if not target_ticker:
                return {"error": f"Ticker {ticker} not found in live database."}
                
            price_query = (
                select(MarketPricing)
                .where(MarketPricing.ticker_id == target_ticker.id)
                .order_by(MarketPricing.timestamp.desc())
                .limit(days_back)
            )
            price_result = await session.execute(price_query)
            prices = price_result.scalars().all()
            
            if not prices:
                return {"error": f"No pricing data available for {ticker}."}
                
            current_price = float(prices[0].close_price)
            avg_moving = sum(float(p.close_price) for p in prices) / len(prices)
            
            return {
                "ticker": ticker,
                "current_price": round(current_price, 2),
                "fifty_day_sma": round(avg_moving, 2),
                "data_points_analyzed": len(prices),
                "data_source": "Live_PostgreSQL_Engine"
            }
            
    # LangGraph executes tools in a synchronous ThreadPoolExecutor.
    # We explicitly initialize a localized event loop to bridge to the async database driver.
    return asyncio.run(fetch_live_data())

# ==========================================
# SECONDARY STRATEGY (LIVE POSTGRESQL FALLBACK)
# ==========================================
class SentimentInput(BaseModel):
    ticker: str = Field(..., description="The stock ticker symbol.")

async def fetch_sentiment_from_db(ticker: str) -> dict:
    """Async helper to securely query PostgreSQL."""
    
    # The 1% Security Standard: Injecting secrets at runtime
    conn_string = os.getenv("DATABASE_URL")
    
    # Defensive Architecture: Fail gracefully if the secret is missing
    if not conn_string:
        return {"error": "CRITICAL: DATABASE_URL environment variable is missing from the container."}
    
    try:
        conn = await asyncpg.connect(conn_string)
        row = await conn.fetchrow(
            "SELECT ticker, sentiment_score, institutional_confidence, warning FROM market_sentiment WHERE ticker = $1",
            ticker
        )
        if row:
            return dict(row)
        return {"error": f"No sentiment data found in database for {ticker}"}
    except Exception as e:
        return {"error": f"Database connection failed: {str(e)}"}
    finally:
        # Always close the connection to prevent connection pooling leaks
        if 'conn' in locals():
            await conn.close()

@tool("get_market_sentiment", args_schema=SentimentInput)
def get_market_sentiment(ticker: str) -> dict:
    """
    Fetches alternative fundamental and news sentiment data for a ticker.
    Use this tool ONLY if the historical price data is inconclusive.
    """
    print(f"\n[TOOL EXECUTING] 🛠️ Agent pivoted strategy: Querying LIVE PostgreSQL for {ticker} sentiment...")
    
    # The 1% Bridge: Safely executing an async DB call inside a sync LangGraph tool
    return asyncio.run(fetch_sentiment_from_db(ticker))