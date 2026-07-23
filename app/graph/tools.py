import os
import json
from langchain_core.tools import tool
from pydantic import BaseModel, Field
from sqlalchemy import select

# Direct database session factory initialization
from database import AsyncSessionLocal
from database.models import MarketPricing, Ticker

# ==========================================
# Tool: Historical Pricing
# ==========================================
class PriceHistoryInput(BaseModel):
    ticker: str = Field(..., description="The stock ticker symbol, e.g., 'AAPL' or 'NVDA'")
    days_back: int = Field(default=50, description="How many days of historical data to retrieve")

@tool("get_historical_prices", args_schema=PriceHistoryInput)
async def get_historical_prices(ticker: str, days_back: int) -> str:
    """
    Fetches the actual historical pricing data from the PostgreSQL time-series database.
    Use this tool whenever you need to evaluate the moving averages or momentum of an asset.
    """
    print(f"\n[TOOL EXECUTING] 🛠️ Agent querying PostgreSQL for {ticker} (Last {days_back} days)")
    
    # Initialize async database session
    async with AsyncSessionLocal() as session:
        try:
            ticker_query = select(Ticker).where(Ticker.symbol == ticker.upper())
            result = await session.execute(ticker_query)
            target_ticker = result.scalar_one_or_none()
            
            if not target_ticker:
                return f"SYSTEM ALERT: Ticker {ticker} not found in live database. Output 'SIGNAL: INVALID'."
                
            price_query = (
                select(MarketPricing)
                .where(MarketPricing.ticker_id == target_ticker.id)
                .order_by(MarketPricing.timestamp.desc())
                .limit(days_back)
            )
            price_result = await session.execute(price_query)
            prices = price_result.scalars().all()
            
            if not prices:
                return f"SYSTEM ALERT: No pricing data available for {ticker}."
                
            current_price = float(prices[0].close_price)
            avg_moving = sum(float(p.close_price) for p in prices) / len(prices)
            
            # Serialize payload for LLM ingestion
            payload = {
                "ticker": ticker.upper(),
                "current_price": round(current_price, 2),
                "fifty_day_sma": round(avg_moving, 2),
                "data_points_analyzed": len(prices),
                "data_source": "Live_PostgreSQL_Engine"
            }
            return json.dumps(payload)
            
        except Exception as e:
            return f"DATABASE ERROR: {str(e)}"

# ==========================================
# Tool: Market Sentiment
# ==========================================
class SentimentInput(BaseModel):
    ticker: str = Field(..., description="The stock ticker symbol.")

@tool("get_market_sentiment", args_schema=SentimentInput)
async def get_market_sentiment(ticker: str) -> str:
    """
    Fetches alternative fundamental and news sentiment data for a ticker from the live database.
    Use this tool ONLY if the historical price data is inconclusive or you need institutional context.
    """
    print(f"\n[TOOL EXECUTING] 🛠️ Agent querying LIVE PostgreSQL sentiment for {ticker}...")
    
    # Initialize async database session
    async with AsyncSessionLocal() as session:
        try:
            # Execute parameterized query
            query = text(
                "SELECT ticker, sentiment_score, institutional_confidence, warning "
                "FROM market_sentiment WHERE ticker = :ticker"
            )
            result = await session.execute(query, {"ticker": ticker.upper()})
            row = result.fetchone()
            
            if not row:
                return f"SYSTEM ALERT: No sentiment data found in database for {ticker}."
                
            # Serialize database record into JSON payload
            payload = {
                "ticker": row.ticker,
                "sentiment_score": row.sentiment_score,
                "institutional_confidence": row.institutional_confidence,
                "warning": row.warning
            }
            return json.dumps(payload)
            
        except Exception as e:
            return f"DATABASE ERROR: {str(e)}"