import asyncio
from langchain_core.tools import tool
from pydantic import BaseModel, Field
from sqlalchemy import select

from database import get_db
from models import MarketPricing, Ticker

# Enforces a strict schema boundary on LLM generation. 
# Prevents hallucinated arguments from causing downstream database query exceptions.
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
    
    # LangGraph tools natively execute in a synchronous thread. 
    # This explicit event loop bridge safely routes the tool execution into the async database driver.
    loop = asyncio.get_event_loop()
    
    async def fetch_live_data():
        async for session in get_db():
            
            # Relational translation: Maps the string ticker to the primary key 
            # to hit the highly optimized composite index on the MarketPricing table.
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
                
            # Deterministic math execution. Offloads calculation to the Python runtime 
            # to absolutely prevent LLM arithmetic hallucinations.
            current_price = float(prices[0].close_price)
            avg_moving = sum(float(p.close_price) for p in prices) / len(prices)
            
            return {
                "ticker": ticker,
                "current_price": round(current_price, 2),
                "fifty_day_sma": round(avg_moving, 2),
                "data_points_analyzed": len(prices),
                "data_source": "Live_PostgreSQL_Engine"
            }
            
    return loop.run_until_complete(fetch_live_data())