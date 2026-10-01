"""
Production Seeding Pipeline & Deterministic Data Ingestion Engine
-----------------------------------------------------------------
Automates deterministic baseline data seeding across 10 benchmark institutional
equities: daily OHLCV candles (90 days), technical signals (RSI 14, Bollinger Bands),
and SEC EDGAR 10-K RAG passages with normalized 1536-dim vector embeddings.
Strictly idempotent via PostgreSQL ON CONFLICT DO UPDATE upserts.
"""

import logging
import math
import os
import random
import time
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Dict, List, Optional

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database.database import AsyncSessionLocal
from app.database.models import ComputedSignal, DocumentChunk, MarketPricing, Ticker
from app.database.schemas import (
    SeedExecutionRequest,
    SeedExecutionResponse,
    SeedStatusReport,
    TickerSeedSummary,
)

logger = logging.getLogger("production_seeder")

BENCHMARK_EQUITIES: Dict[str, Dict[str, any]] = {
    "AAPL": {"name": "Apple Inc.", "base_price": 185.0, "volatility": 0.015, "trend": 0.0008},
    "MSFT": {"name": "Microsoft Corporation", "base_price": 420.0, "volatility": 0.014, "trend": 0.0007},
    "NVDA": {"name": "NVIDIA Corporation", "base_price": 125.0, "volatility": 0.028, "trend": 0.0020},
    "GOOGL": {"name": "Alphabet Inc.", "base_price": 175.0, "volatility": 0.016, "trend": 0.0009},
    "AMZN": {"name": "Amazon.com Inc.", "base_price": 185.0, "volatility": 0.018, "trend": 0.0010},
    "TSLA": {"name": "Tesla Inc.", "base_price": 240.0, "volatility": 0.035, "trend": 0.0012},
    "META": {"name": "Meta Platforms Inc.", "base_price": 500.0, "volatility": 0.022, "trend": 0.0015},
    "AMD": {"name": "Advanced Micro Devices Inc.", "base_price": 160.0, "volatility": 0.026, "trend": 0.0011},
    "JPM": {"name": "JPMorgan Chase & Co.", "base_price": 210.0, "volatility": 0.012, "trend": 0.0006},
    "SPY": {"name": "SPDR S&P 500 ETF Trust", "base_price": 550.0, "volatility": 0.009, "trend": 0.0005},
}


def generate_deterministic_candles(symbol: str, days: int = 90) -> List[Dict]:
    """
    Generates a deterministic sequence of daily OHLCV bars using a seeded PRNG.
    Produces realistic trends, volume variations, and High/Low shadows.
    """
    meta = BENCHMARK_EQUITIES.get(
        symbol, {"base_price": 100.0, "volatility": 0.02, "trend": 0.001}
    )
    seed_val = int.from_bytes(symbol.encode("utf-8"), "big") % 1000000 + 2026
    prng = random.Random(seed_val)

    now = datetime.now(timezone.utc).replace(hour=20, minute=0, second=0, microsecond=0)
    current_price = meta["base_price"]

    candles = []
    # Generate days chronologically from (now - days) to now
    for i in range(days, 0, -1):
        bar_date = now - timedelta(days=i)

        # Skip weekends to preserve realistic market time-series
        if bar_date.weekday() >= 5:
            continue

        pct_change = prng.gauss(meta["trend"], meta["volatility"])
        open_price = round(current_price, 2)
        close_price = round(max(5.0, open_price * (1 + pct_change)), 2)

        shadow_high = prng.uniform(0.001, 0.012)
        shadow_low = prng.uniform(0.001, 0.012)
        high_price = round(max(open_price, close_price) * (1 + shadow_high), 2)
        low_price = round(min(open_price, close_price) * (1 - shadow_low), 2)

        base_vol = 15000000 if symbol in ("AAPL", "NVDA", "TSLA", "SPY") else 5000000
        vol_mult = prng.uniform(0.7, 1.8)
        volume = int(base_vol * vol_mult)

        candles.append(
            {
                "timestamp": bar_date,
                "open": open_price,
                "high": high_price,
                "low": low_price,
                "close": close_price,
                "volume": volume,
            }
        )
        current_price = close_price

    return candles


def compute_signals_for_candles(candles: List[Dict]) -> List[Dict]:
    """
    Computes deterministic technical signals: RSI 14 and Bollinger Bands (20, 2).
    """
    signals = []
    closes = [c["close"] for c in candles]

    for idx, c in enumerate(candles):
        # RSI 14 calculation
        rsi_val = None
        rsi_status = "NEUTRAL"
        if idx >= 14:
            gains = []
            losses = []
            for j in range(idx - 13, idx + 1):
                diff = closes[j] - closes[j - 1]
                if diff > 0:
                    gains.append(diff)
                    losses.append(0.0)
                else:
                    gains.append(0.0)
                    losses.append(abs(diff))

            avg_gain = sum(gains) / 14.0
            avg_loss = sum(losses) / 14.0

            if avg_loss == 0:
                rsi_val = 100.0
            else:
                rs = avg_gain / avg_loss
                rsi_val = round(100.0 - (100.0 / (1.0 + rs)), 4)

            if rsi_val >= 70.0:
                rsi_status = "OVERBOUGHT"
            elif rsi_val <= 30.0:
                rsi_status = "OVERSOLD"

        # Bollinger Bands (20 periods)
        bb_upper = None
        bb_middle = None
        bb_lower = None
        bb_status = "NORMAL"
        bandwidth = None

        if idx >= 20:
            window = closes[idx - 19 : idx + 1]
            mean = sum(window) / 20.0
            variance = sum((p - mean) ** 2 for p in window) / 20.0
            std_dev = math.sqrt(variance)

            bb_middle = round(mean, 4)
            bb_upper = round(mean + (2.0 * std_dev), 4)
            bb_lower = round(mean - (2.0 * std_dev), 4)

            if mean > 0:
                bandwidth = round(((bb_upper - bb_lower) / mean) * 100.0, 4)

            current_c = closes[idx]
            if current_c > bb_upper:
                bb_status = "UPPER_BREAKOUT"
            elif current_c < bb_lower:
                bb_status = "LOWER_BREAKOUT"

        signals.append(
            {
                "timestamp": c["timestamp"],
                "rsi_14": rsi_val,
                "rsi_status": rsi_status,
                "bollinger_upper": bb_upper,
                "bollinger_middle": bb_middle,
                "bollinger_lower": bb_lower,
                "bollinger_status": bb_status,
                "bandwidth_pct": bandwidth,
            }
        )

    return signals


def generate_baseline_rag_passages(symbol: str, company: str) -> List[Dict]:
    """
    Generates structured SEC EDGAR 10-K RAG passages with normalized 1536-dim vector embeddings.
    """
    seed_val = int.from_bytes(symbol.encode("utf-8"), "big") % 1000000 + 42
    prng = random.Random(seed_val)

    # Generate synthetic 1536-dim normalized vector
    raw_vec = [prng.gauss(0.0, 1.0) for _ in range(1536)]
    norm = math.sqrt(sum(x * x for x in raw_vec))
    embedding = [round(x / norm, 6) for x in raw_vec]

    passages = [
        {
            "chunk_index": 0,
            "page_number": 1,
            "content": f"{company} ({symbol}) Form 10-K Annual Report: Business Overview and Core Operational Segments. "
            f"The company maintains institutional market share through continuous R&D and proprietary capital allocation.",
        },
        {
            "chunk_index": 1,
            "page_number": 24,
            "content": f"{symbol} Financial Condition and Management Discussion: Robust free cash flow conversion, "
            f"balanced debt maturity schedules, and continuous gross margin expansion over the trailing four fiscal quarters.",
        },
        {
            "chunk_index": 2,
            "page_number": 42,
            "content": f"{symbol} Risk Factors & Strategic Positioning: Supply chain diversification, global regulatory compliance, "
            f"and macroeconomic sensitivity to central bank interest rate benchmarks.",
        },
    ]

    return [{"embedding": embedding, **p} for p in passages]


class ProductionSeedManager:
    """
    Institutional database seeder ensuring repeatable, idempotent data population
    across the 10 core equity benchmarks.
    """

    async def get_seed_status(self, trace_id: Optional[str] = None) -> SeedStatusReport:
        active_trace = trace_id or os.urandom(16).hex()

        async with AsyncSessionLocal() as session:
            # 1. Fetch all tickers in DB
            res = await session.execute(select(Ticker))
            db_tickers = {t.symbol: t for t in res.scalars().all()}

            summaries: List[TickerSeedSummary] = []
            total_candles = 0
            total_signals = 0
            total_rag_chunks = 0

            for symbol, meta in BENCHMARK_EQUITIES.items():
                ticker_obj = db_tickers.get(symbol)
                if not ticker_obj:
                    summaries.append(
                        TickerSeedSummary(
                            symbol=symbol,
                            company_name=meta["name"],
                            candles_count=0,
                            signals_count=0,
                            rag_chunks_count=0,
                            latest_candle_date=None,
                            status="EMPTY",
                        )
                    )
                    continue

                # Query candle count and latest date
                candle_res = await session.execute(
                    select(
                        func.count(MarketPricing.id),
                        func.max(MarketPricing.timestamp),
                    ).where(MarketPricing.ticker_id == ticker_obj.id)
                )
                c_count, max_ts = candle_res.one()

                # Query signals count
                sig_res = await session.execute(
                    select(func.count(ComputedSignal.id)).where(
                        ComputedSignal.ticker_id == ticker_obj.id
                    )
                )
                s_count = sig_res.scalar() or 0

                # Query RAG chunks count
                chunk_res = await session.execute(
                    select(func.count(DocumentChunk.id)).where(DocumentChunk.ticker == symbol)
                )
                r_count = chunk_res.scalar() or 0

                total_candles += c_count or 0
                total_signals += s_count
                total_rag_chunks += r_count

                latest_str = max_ts.strftime("%Y-%m-%d") if max_ts else None
                status = "SEEDED" if (c_count and c_count >= 20) else "INCOMPLETE"

                summaries.append(
                    TickerSeedSummary(
                        symbol=symbol,
                        company_name=meta["name"],
                        candles_count=c_count or 0,
                        signals_count=s_count,
                        rag_chunks_count=r_count,
                        latest_candle_date=latest_str,
                        status=status,
                    )
                )

            is_seeded = all(s.status == "SEEDED" for s in summaries)

            return SeedStatusReport(
                system_name="Automated Equity Research Engine",
                is_seeded=is_seeded,
                total_tickers=len(BENCHMARK_EQUITIES),
                total_candles=total_candles,
                total_signals=total_signals,
                total_rag_chunks=total_rag_chunks,
                tickers=summaries,
                timestamp_iso=datetime.now(timezone.utc).isoformat(),
                trace_id=active_trace,
            )

    async def run_seed(
        self,
        request: Optional[SeedExecutionRequest] = None,
        trace_id: Optional[str] = None,
    ) -> SeedExecutionResponse:
        start_t = time.perf_counter()
        active_trace = trace_id or os.urandom(16).hex()
        run_id = f"seed_{os.urandom(6).hex()}"

        req = request or SeedExecutionRequest()
        target_symbols = req.tickers or list(BENCHMARK_EQUITIES.keys())
        days_history = req.days_history

        total_candles_inserted = 0
        total_signals_inserted = 0
        total_chunks_inserted = 0
        processed_symbols = []

        async with AsyncSessionLocal() as session:
            for symbol in target_symbols:
                meta = BENCHMARK_EQUITIES.get(symbol, {"name": f"{symbol} Corporation"})

                # 1. Upsert Ticker
                stmt_ticker = (
                    pg_insert(Ticker)
                    .values(symbol=symbol, company_name=meta["name"], is_active=True)
                    .on_conflict_do_update(
                        index_elements=["symbol"],
                        set_={"company_name": meta["name"], "is_active": True},
                    )
                    .returning(Ticker.id)
                )
                res_ticker = await session.execute(stmt_ticker)
                ticker_id = res_ticker.scalar_one()

                # 2. Generate and Upsert Daily OHLCV Candles
                candles = generate_deterministic_candles(symbol, days=days_history)
                for c in candles:
                    stmt_pricing = (
                        pg_insert(MarketPricing)
                        .values(
                            ticker_id=ticker_id,
                            timestamp=c["timestamp"],
                            open_price=Decimal(str(c["open"])),
                            high_price=Decimal(str(c["high"])),
                            low_price=Decimal(str(c["low"])),
                            close_price=Decimal(str(c["close"])),
                            volume=c["volume"],
                        )
                        .on_conflict_do_update(
                            constraint="uix_ticker_timestamp",
                            set_={
                                "open_price": Decimal(str(c["open"])),
                                "high_price": Decimal(str(c["high"])),
                                "low_price": Decimal(str(c["low"])),
                                "close_price": Decimal(str(c["close"])),
                                "volume": c["volume"],
                            },
                        )
                    )
                    await session.execute(stmt_pricing)
                    total_candles_inserted += 1

                # 3. Compute and Upsert Technical Signals (RSI 14, Bollinger)
                signals = compute_signals_for_candles(candles)
                for s in signals:
                    stmt_sig = (
                        pg_insert(ComputedSignal)
                        .values(
                            ticker_id=ticker_id,
                            timestamp=s["timestamp"],
                            rsi_14=Decimal(str(s["rsi_14"])) if s["rsi_14"] is not None else None,
                            rsi_status=s["rsi_status"],
                            bollinger_upper=Decimal(str(s["bollinger_upper"])) if s["bollinger_upper"] is not None else None,
                            bollinger_middle=Decimal(str(s["bollinger_middle"])) if s["bollinger_middle"] is not None else None,
                            bollinger_lower=Decimal(str(s["bollinger_lower"])) if s["bollinger_lower"] is not None else None,
                            bollinger_status=s["bollinger_status"],
                            bandwidth_pct=Decimal(str(s["bandwidth_pct"])) if s["bandwidth_pct"] is not None else None,
                        )
                        .on_conflict_do_update(
                            constraint="uix_computed_ticker_timestamp",
                            set_={
                                "rsi_14": Decimal(str(s["rsi_14"])) if s["rsi_14"] is not None else None,
                                "rsi_status": s["rsi_status"],
                                "bollinger_upper": Decimal(str(s["bollinger_upper"])) if s["bollinger_upper"] is not None else None,
                                "bollinger_middle": Decimal(str(s["bollinger_middle"])) if s["bollinger_middle"] is not None else None,
                                "bollinger_lower": Decimal(str(s["bollinger_lower"])) if s["bollinger_lower"] is not None else None,
                                "bollinger_status": s["bollinger_status"],
                                "bandwidth_pct": Decimal(str(s["bandwidth_pct"])) if s["bandwidth_pct"] is not None else None,
                            },
                        )
                    )
                    await session.execute(stmt_sig)
                    total_signals_inserted += 1

                # 4. Upsert SEC EDGAR RAG Passages
                if req.seed_rag_passages:
                    passages = generate_baseline_rag_passages(symbol, meta["name"])
                    doc_id = f"doc_{symbol.lower()}_10k"
                    for p in passages:
                        chunk_id = f"chunk_{symbol.lower()}_{p['chunk_index']}"
                        stmt_chunk = (
                            pg_insert(DocumentChunk)
                            .values(
                                id=chunk_id,
                                document_id=doc_id,
                                ticker=symbol,
                                source_file=f"{symbol}_2025_10K.pdf",
                                doc_type="10-K",
                                chunk_index=p["chunk_index"],
                                page_number=p["page_number"],
                                content=p["content"],
                                token_count=len(p["content"].split()),
                                embedding=p["embedding"],
                            )
                            .on_conflict_do_update(
                                constraint="uix_doc_chunk_index",
                                set_={
                                    "content": p["content"],
                                    "embedding": p["embedding"],
                                    "token_count": len(p["content"].split()),
                                },
                            )
                        )
                        await session.execute(stmt_chunk)
                        total_chunks_inserted += 1

                processed_symbols.append(symbol)

            await session.commit()

        duration_ms = round((time.perf_counter() - start_t) * 1000, 2)
        logger.info(
            f"Seeded {len(processed_symbols)} tickers ({total_candles_inserted} candles, "
            f"{total_signals_inserted} signals, {total_chunks_inserted} chunks) in {duration_ms}ms"
        )

        return SeedExecutionResponse(
            run_id=run_id,
            status="COMPLETED",
            seeded_tickers_count=len(processed_symbols),
            total_candles_inserted=total_candles_inserted,
            total_signals_inserted=total_signals_inserted,
            total_chunks_inserted=total_chunks_inserted,
            duration_ms=duration_ms,
            tickers=processed_symbols,
            timestamp_iso=datetime.now(timezone.utc).isoformat(),
            trace_id=active_trace,
        )
