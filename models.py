from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, Boolean, DECIMAL, BigInteger, ForeignKey, DateTime, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column

# Import the Base class we initialized in Day 9
from database import Base

class Ticker(Base):
    __tablename__ = "tickers"

    # Strict SQLAlchemy 2.0 Type Hinting (Mapped[type])
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(10), unique=True, nullable=False)
    company_name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class MarketPricing(Base):
    __tablename__ = "market_pricing"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    ticker_id: Mapped[int] = mapped_column(ForeignKey("tickers.id", ondelete="CASCADE"), nullable=False)
    
    # Financial data demands exact timezone awareness
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    
    # Explicitly mapping Python's Decimal to PostgreSQL's DECIMAL
    open_price: Mapped[Decimal] = mapped_column(DECIMAL(10, 4), nullable=False)
    high_price: Mapped[Decimal] = mapped_column(DECIMAL(10, 4), nullable=False)
    low_price: Mapped[Decimal] = mapped_column(DECIMAL(10, 4), nullable=False)
    close_price: Mapped[Decimal] = mapped_column(DECIMAL(10, 4), nullable=False)
    
    # Standard Python ints will crash on heavy trading days; map to BigInteger
    volume: Mapped[int] = mapped_column(BigInteger, nullable=False)

    # ----------------------------------------------------------------------
    # THE COMPOSITE GUARDRAIL
    # ----------------------------------------------------------------------
    __table_args__ = (
        UniqueConstraint("ticker_id", "timestamp", name="uix_ticker_timestamp"),

        # 2. The Retrieval Highway (Explicitly indexed for time-series range queries)
        Index("ix_market_pricing_timestamp", "timestamp"),
    )