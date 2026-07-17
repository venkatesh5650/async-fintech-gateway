from langchain_core.tools import tool
from pydantic import BaseModel, Field

# ==========================================
# 1. DEFINE THE STRICT INPUT SCHEMA
# ==========================================
# We force the LLM to adhere to this schema so it can never pass bad data types
class PriceHistoryInput(BaseModel):
    ticker: str = Field(..., description="The stock ticker symbol, e.g., 'AAPL' or 'NVDA'")
    days_back: int = Field(default=50, description="How many days of historical data to retrieve")

# ==========================================
# 2. DEFINE THE EXECUTABLE TOOL
# ==========================================
@tool("get_historical_prices", args_schema=PriceHistoryInput)
def get_historical_prices(ticker: str, days_back: int) -> dict:
    """
    Fetches the actual historical pricing data from the PostgreSQL time-series database.
    Use this tool whenever you need to evaluate the moving averages or momentum of an asset.
    """
    print(f"\n[TOOL EXECUTING] 🛠️ Agent invoked get_historical_prices for {ticker} (Last {days_back} days)")
    
    # Tomorrow, we will replace this block with your actual crud.get_market_data async function.
    # For today's structural binding, we simulate the database ping.
    
    mock_db_response = {
        "ticker": ticker,
        "current_price": 195.00,
        "fifty_day_sma": 180.50,
        "volume_spike_detected": True,
        "data_source": "PostgreSQL_Engine"
    }
    
    return mock_db_response