from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, Boolean, DECIMAL, BigInteger, ForeignKey, DateTime, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
import json
from sqlalchemy.types import TypeDecorator, JSON

class Vector(TypeDecorator):
    impl = JSON
    cache_ok = True

    def __init__(self, dim: int = 1536, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.dim = dim

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return list(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, str):
            return json.loads(value)
        return list(value)

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


class ComputedSignal(Base):
    __tablename__ = "computed_signals"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    ticker_id: Mapped[int] = mapped_column(ForeignKey("tickers.id", ondelete="CASCADE"), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    rsi_14: Mapped[Decimal] = mapped_column(DECIMAL(10, 4), nullable=True)
    rsi_status: Mapped[str] = mapped_column(String(50), nullable=True)
    bollinger_upper: Mapped[Decimal] = mapped_column(DECIMAL(10, 4), nullable=True)
    bollinger_middle: Mapped[Decimal] = mapped_column(DECIMAL(10, 4), nullable=True)
    bollinger_lower: Mapped[Decimal] = mapped_column(DECIMAL(10, 4), nullable=True)
    bollinger_status: Mapped[str] = mapped_column(String(50), nullable=True)
    bandwidth_pct: Mapped[Decimal] = mapped_column(DECIMAL(10, 4), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("ticker_id", "timestamp", name="uix_computed_ticker_timestamp"),
        Index("idx_computed_ticker_ts_desc", "ticker_id", timestamp.desc()),
    )


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    document_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    ticker: Mapped[str] = mapped_column(String(10), index=True, nullable=False)
    source_file: Mapped[str] = mapped_column(String(255), nullable=False)
    doc_type: Mapped[str] = mapped_column(String(20), nullable=False)
    chunk_index: Mapped[int] = mapped_column(BigInteger, nullable=False)
    page_number: Mapped[int] = mapped_column(BigInteger, nullable=False)
    content: Mapped[str] = mapped_column(String, nullable=False)
    token_count: Mapped[int] = mapped_column(BigInteger, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(1536), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("document_id", "chunk_index", name="uix_doc_chunk_index"),
        Index("idx_doc_chunks_ticker", "ticker"),
    )
