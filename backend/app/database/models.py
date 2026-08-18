from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, Boolean, DECIMAL, BigInteger, ForeignKey, DateTime, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database.database import Base

class Ticker(Base):
    __tablename__ = "tickers"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(10), unique=True, index=True, nullable=False)
    company_name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class MarketPricing(Base):
    __tablename__ = "market_pricing"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    ticker_id: Mapped[int] = mapped_column(ForeignKey("tickers.id", ondelete="CASCADE"), nullable=False) 
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)   
    open_price: Mapped[Decimal] = mapped_column(DECIMAL(10, 4), nullable=False)
    high_price: Mapped[Decimal] = mapped_column(DECIMAL(10, 4), nullable=False)
    low_price: Mapped[Decimal] = mapped_column(DECIMAL(10, 4), nullable=False)
    close_price: Mapped[Decimal] = mapped_column(DECIMAL(10, 4), nullable=False)  
    volume: Mapped[int] = mapped_column(BigInteger, nullable=False)

    __table_args__ = (
        UniqueConstraint("ticker_id", "timestamp", name="uix_ticker_timestamp"),
        # Optimized composite index for high-throughput time-series equity range queries
        Index("idx_ticker_timestamp_desc", "ticker_id", timestamp.desc()),
    )

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())