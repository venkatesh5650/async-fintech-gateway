from fastapi import FastAPI, HTTPException, status, Request, BackgroundTasks
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, Field, field_validator
import httpx
import logging
import os

app = FastAPI(title="Fintech Data Ingestion firewall")

# Override default 422 Unprocessable Entity to enforce strict corporate API contracts.
# Masks internal Pydantic schema traces from potential bad actors while providing structured debugging.
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = []
    for error in exc.errors():
        errors.append({
            "field": ".".join(str(loc) for loc in error["loc"] if loc != "body"),
            "issue": error["msg"],
            "rejected_value": error.get("input")
        })
    
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST, 
        content={
            "status": "blocked",
            "error_type": "DataFirewallViolation",
            "details": errors
        }
    )

# Zero-trust perimeter schema. Enforces strict type casting and boundary checks 
# before the payload enters the asyncio event loop or downstream storage.
class MarketDataPayload(BaseModel):
    ticker: str = Field(..., description="Equity ticker symbol (e.g., AAPL, TSLA)")
    asset_class: str = Field(..., description="Asset type classification")
    current_price: float = Field(..., gt=0.0, description="Current spot price, must be strictly positive")
    volume: int = Field(..., gt=0, description="24-hour trading volume")

    # Normalize external inputs to prevent SQL injection or routing errors downstream.
    @field_validator("ticker")
    @classmethod
    def validate_ticker_format(cls,value:str) -> str:
        clean_ticker=value.upper().strip()
        if not clean_ticker.isalpha() or not (1<=len(clean_ticker)<=5):
            raise ValueError("Ticker must be 1-5 alphabetic characters only.")
        return clean_ticker
    
    # Restrict downstream processing to supported institutional asset classes.
    @field_validator("asset_class")
    @classmethod
    def validate_class_method(cls,value:str) -> str:
        allowed={"CRYPTO","FOREX","EQUITY","COMMODITY"}
        clean_vlaue=value.upper().strip()
        if clean_vlaue not in allowed:
            raise ValueError(f"Asset class must be one of {allowed}")
        return clean_vlaue

ALPHA_VANTAGE_KEY=os.getenv("ALPHA_VANTAGE_KEY")

async def fetch_live_market_content(payload: MarketDataPayload):
    """
    Delegates outbound network I/O to a non-blocking background thread.
    Prevents external API latency from starving the primary FastAPI event loop.
    """
    url=f"https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol={payload.ticker}&apikey={ALPHA_VANTAGE_KEY}"

    logging.warning(f"[OUTBOUND ASYNC] Reaching out to Alpha Vantage for upstream validation on {payload.ticker}...")

    try:
        # Enforce strict timeouts to prevent hanging sockets if the upstream provider goes down
        async with httpx.AsyncClient(timeout=10.0) as client:
            response=await client.get(url)

            if response.status_code==200:
                market_data=response.json()
                global_quote=market_data.get("Global_Quote",{})

                if global_quote:
                    logging.warning(f"✅ [INTEGRATION SUCCESS] Upstream verification complete for {payload.ticker}. Real-world data verified.")
                    logging.warning(f"📊 Live Data Dump: {global_quote}")
                else:
                    logging.warning(f"⚠️ [API DATA WARN] API responded, but data structure was empty or rate-limited: {market_data}")
            else:
                logging.error(f"❌ [API ERROR] Upstream provider returned non-200 status code: {response.status_code}")

    except httpx.RequestError as exc:
        logging.error(f"❌ [NETWORK FAILURE] Failed to communicate with upstream API tier: {exc}")

@app.get("/health")
async def health_check():
    return {"status": "healthy", "firewall": "active", "scope":"fintech"}

@app.post("/v1/market-data/ingest", status_code=status.HTTP_202_ACCEPTED)
async def ingest_market_data(payload: MarketDataPayload, background_tasks: BackgroundTasks):
    """
    Ingestion gateway. Designed for O(1) synchronous execution time. 
    Instantly releases the client connection to maintain high throughput under heavy webhook load.
    """
    background_tasks.add_task(fetch_live_market_content, payload)
    
    return {
        "status": "allowed",
        "message": f"Asset metrics for {payload.ticker} verified. Offloaded to downstream analytics pipeline.",
        "tracking_id": "async_task_dispatched"
    }