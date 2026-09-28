from fastapi import APIRouter, Depends, HTTPException, status, Security
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.database import get_db
from app.core.analytics import QuantitativeAnalyticsEngine
from app.core.telemetry import generate_trace_id
from app.routers.intelligence import verify_m2m_or_user

router = APIRouter(prefix="/v1/analytics", tags=["Quantitative Analytics"])


class BollingerBandsSchema(BaseModel):
    upper: Optional[float] = Field(None, description="Upper Bollinger Band (20-day, +2σ)")
    middle: Optional[float] = Field(None, description="Middle Bollinger Band (20-day SMA)")
    lower: Optional[float] = Field(None, description="Lower Bollinger Band (20-day, -2σ)")
    bandwidth_pct: Optional[float] = Field(None, description="Bandwidth percentage")
    status: str = Field("WITHIN_BANDS", description="Price relative to bands")


class IndicatorsSchema(BaseModel):
    sma_10: Optional[float] = Field(None, description="10-period Simple Moving Average")
    sma_50: Optional[float] = Field(None, description="50-period Simple Moving Average")
    sma_200: Optional[float] = Field(None, description="200-period Simple Moving Average")
    ema_14: Optional[float] = Field(None, description="14-period Exponential Moving Average")
    vwap: Optional[float] = Field(None, description="Volume-Weighted Average Price")
    rsi_14: Optional[float] = Field(None, description="14-period Relative Strength Index")
    rsi_status: str = Field("NEUTRAL", description="RSI classification code")
    bollinger_bands: BollingerBandsSchema = Field(..., description="20-period Bollinger Bands metrics")


class SignalSchema(BaseModel):
    status: str = Field(..., description="Signal classification code")
    strength: str = Field(..., description="Signal confidence strength")
    description: str = Field(..., description="Deterministic human-readable explanation")


class TickerAnalyticsResponse(BaseModel):
    symbol: str
    calculated_at: Optional[str] = None
    data_points_analyzed: int
    current_price: Optional[float] = None
    indicators: IndicatorsSchema
    crossover_signal: SignalSchema
    trace_id: str


class VolatilityMetricsResponse(BaseModel):
    symbol: str
    calculated_at: Optional[str] = None
    data_points_analyzed: int
    volatility_30d_pct: Optional[float] = Field(None, description="Annualized 30-day volatility %")
    sharpe_ratio: Optional[float] = Field(None, description="Sharpe ratio (risk-adjusted return)")
    max_drawdown_pct: Optional[float] = Field(None, description="Maximum peak-to-trough drawdown %")
    risk_level: str = Field("MODERATE_RISK", description="Risk level classification")
    sharpe_rating: str = Field("SUBPAR", description="Sharpe ratio rating")
    trace_id: str


class CorrelationMatrixResponse(BaseModel):
    symbols: List[str] = Field(..., description="List of equity tickers analyzed")
    matrix: Dict[str, Dict[str, Optional[float]]] = Field(..., description="Pairwise correlation matrix values (-1.0 to +1.0)")
    days_analyzed: int = Field(30, description="Lookback window in days")
    data_points_analyzed: int = Field(..., description="Total price pairs analyzed")
    trace_id: str


# ==================================================
# SPECIFIC / STATIC PATH ROUTES MUST COME FIRST
# ==================================================

@router.get("/correlation", response_model=CorrelationMatrixResponse)
async def get_correlation_matrix(
    symbols: Optional[str] = None,
    days: int = 30,
    session: AsyncSession = Depends(get_db),
    auth_verified: dict = Security(verify_m2m_or_user)
):
    """
    Computes cross-ticker correlation matrix using PostgreSQL CORR() statistical function.
    """
    trace_id = generate_trace_id()
    symbol_list = [s.strip() for s in symbols.split(",")] if symbols and symbols.strip() else None

    correlation_data = await QuantitativeAnalyticsEngine.compute_correlation_matrix(
        session=session,
        symbols=symbol_list,
        days=days
    )
    correlation_data["trace_id"] = trace_id

    return correlation_data


@router.get("/sectors")
async def get_sector_rotation_analytics(
    days: int = 30,
    session: AsyncSession = Depends(get_db),
    auth_verified: dict = Security(verify_m2m_or_user)
):
    """
    Computes cross-asset sector performance averages, technical composite momentum, and rotation signals.
    """
    trace_id = generate_trace_id()
    sector_data = await QuantitativeAnalyticsEngine.compute_sector_rotation(session=session, days=days)
    sector_data["trace_id"] = trace_id
    return sector_data


@router.get("/snapshots/diff/{ticker}")
async def get_signal_snapshot_diff(
    ticker: str,
    session: AsyncSession = Depends(get_db),
    auth_verified: dict = Security(verify_m2m_or_user)
):
    """
    Compares the latest two quantitative signal snapshots for a ticker and returns exact metric deltas.
    """
    trace_id = generate_trace_id()
    diff_data = await QuantitativeAnalyticsEngine.get_snapshot_diff(session=session, symbol=ticker)
    diff_data["trace_id"] = trace_id
    return diff_data


@router.get("/snapshots/{ticker}")
async def get_signal_snapshots_history(
    ticker: str,
    limit: int = 10,
    session: AsyncSession = Depends(get_db),
    auth_verified: dict = Security(verify_m2m_or_user)
):
    """
    Returns historical versioned signal snapshots recorded for a specified equity ticker.
    """
    trace_id = generate_trace_id()
    snapshots_data = await QuantitativeAnalyticsEngine.get_snapshots(session=session, symbol=ticker, limit=limit)
    snapshots_data["trace_id"] = trace_id
    return snapshots_data


@router.get("/volatility/{ticker}", response_model=VolatilityMetricsResponse)
async def get_ticker_volatility(
    ticker: str,
    session: AsyncSession = Depends(get_db),
    auth_verified: dict = Security(verify_m2m_or_user)
):
    """
    Computes 30-day rolling annualized volatility, Sharpe ratio, and peak-to-trough Max Drawdown.
    """
    trace_id = generate_trace_id()

    volatility_data = await QuantitativeAnalyticsEngine.compute_volatility_metrics(session, ticker)
    volatility_data["trace_id"] = trace_id

    return volatility_data


class CompositeComponentsSchema(BaseModel):
    sma_crossover: Dict[str, Any]
    rsi_14: Dict[str, Any]
    bollinger_bands: Dict[str, Any]
    sharpe_ratio: Dict[str, Any]


class CompositeSignalResponse(BaseModel):
    symbol: str
    calculated_at: Optional[str] = None
    data_points_analyzed: int
    composite_score: float = Field(..., description="Weighted composite technical score (0 to 100)")
    recommendation: str = Field(..., description="Classification: STRONG_BUY, BUY, NEUTRAL, SELL, STRONG_SELL")
    components: CompositeComponentsSchema = Field(..., description="Component scores and weights")
    trace_id: str


@router.get("/composite/{ticker}", response_model=CompositeSignalResponse)
async def get_composite_signal(
    ticker: str,
    session: AsyncSession = Depends(get_db),
    auth_verified: dict = Security(verify_m2m_or_user)
):
    """
    Computes weighted multi-factor composite quantitative score (0-100) and recommendation signal.
    """
    trace_id = generate_trace_id()

    composite_data = await QuantitativeAnalyticsEngine.compute_composite_signal(session, ticker)
    composite_data["trace_id"] = trace_id

    return composite_data


class BacktestRequest(BaseModel):
    ticker: str = Field(..., description="Target equity ticker symbol")
    initial_capital: float = Field(10000.0, description="Initial portfolio cash")
    strategy: str = Field("SMA_CROSSOVER", description="Strategy type: SMA_CROSSOVER, RSI_THRESHOLD, COMPOSITE_SCORE")
    days: int = Field(90, description="Historical lookback window in days")


@router.post("/backtest")
async def run_strategy_backtest(
    payload: BacktestRequest,
    session: AsyncSession = Depends(get_db),
    auth_verified: dict = Security(verify_m2m_or_user)
):
    """
    Executes algorithmic strategy backtest against historical pricing data and compares against Buy & Hold benchmark.
    """
    trace_id = generate_trace_id()
    result = await QuantitativeAnalyticsEngine.run_backtest(
        session=session,
        symbol=payload.ticker,
        initial_capital=payload.initial_capital,
        strategy=payload.strategy,
        days=payload.days
    )
    result["trace_id"] = trace_id
    return result



@router.get("/{ticker}", response_model=TickerAnalyticsResponse)
async def get_ticker_analytics(
    ticker: str,
    session: AsyncSession = Depends(get_db),
    auth_verified: dict = Security(verify_m2m_or_user)
):
    """
    Computes time-series quantitative technical indicators (SMA, EMA, VWAP, RSI, Bollinger Bands) 
    and SMA crossover signals for a specified equity ticker.
    """
    trace_id = generate_trace_id()

    analytics_data = await QuantitativeAnalyticsEngine.compute_indicators(session, ticker)
    analytics_data["trace_id"] = trace_id

    return analytics_data
