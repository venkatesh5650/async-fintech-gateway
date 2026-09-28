import math
from datetime import datetime
from decimal import Decimal
from typing import Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database.models import ComputedSignal


def safe_float(val: Any) -> Optional[float]:
    """
    Safely casts database numeric values to float, converting NaN/Inf/None 
    to valid JSON-serializable None.
    """
    if val is None:
        return None
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return None
        return f
    except (ValueError, TypeError):
        return None


class QuantitativeAnalyticsEngine:
    """
    Quantitative technical analysis engine executing native PostgreSQL 
    window functions over distinct historical time-series pricing data.
    """

    @staticmethod
    async def compute_indicators(session: AsyncSession, symbol: str) -> Dict[str, Any]:
        symbol_upper = symbol.upper()

        query = text("""
            WITH raw_pricing AS (
                SELECT 
                    mp.ticker_id,
                    mp.timestamp,
                    mp.close_price,
                    mp.high_price,
                    mp.low_price,
                    mp.volume,
                    DATE(mp.timestamp) as price_date
                FROM market_pricing mp
                JOIN tickers t ON mp.ticker_id = t.id
                WHERE t.symbol = :symbol
            ),
            distinct_daily_pricing AS (
                SELECT DISTINCT ON (price_date)
                    ticker_id,
                    timestamp,
                    close_price,
                    high_price,
                    low_price,
                    volume
                FROM raw_pricing
                ORDER BY price_date DESC, timestamp DESC
            ),
            ordered_pricing AS (
                SELECT * FROM distinct_daily_pricing ORDER BY timestamp ASC
            ),
            price_changes AS (
                SELECT 
                    ticker_id,
                    timestamp,
                    close_price,
                    high_price,
                    low_price,
                    volume,
                    close_price - LAG(close_price, 1) OVER (ORDER BY timestamp) AS price_diff,
                    AVG(close_price) OVER (ORDER BY timestamp ROWS BETWEEN 9 PRECEDING AND CURRENT ROW) AS sma_10,
                    AVG(close_price) OVER (ORDER BY timestamp ROWS BETWEEN 49 PRECEDING AND CURRENT ROW) AS sma_50,
                    AVG(close_price) OVER (ORDER BY timestamp ROWS BETWEEN 199 PRECEDING AND CURRENT ROW) AS sma_200,
                    AVG(close_price) OVER (ORDER BY timestamp ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS bb_middle,
                    STDDEV_SAMP(close_price) OVER (ORDER BY timestamp ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS bb_stddev,
                    (high_price + low_price + close_price) / 3.0 AS typical_price
                FROM ordered_pricing
            ),
            gains_losses AS (
                SELECT 
                    *,
                    CASE WHEN price_diff > 0 THEN price_diff ELSE 0 END AS gain,
                    CASE WHEN price_diff < 0 THEN ABS(price_diff) ELSE 0 END AS loss
                FROM price_changes
            ),
            avg_gains_losses AS (
                SELECT 
                    *,
                    AVG(gain) OVER (ORDER BY timestamp ROWS BETWEEN 13 PRECEDING AND CURRENT ROW) AS avg_gain_14,
                    AVG(loss) OVER (ORDER BY timestamp ROWS BETWEEN 13 PRECEDING AND CURRENT ROW) AS avg_loss_14,
                    SUM(typical_price * COALESCE(NULLIF(volume, 0), 1)) OVER (ORDER BY timestamp) / 
                        NULLIF(SUM(COALESCE(NULLIF(volume, 0), 1)) OVER (ORDER BY timestamp), 0) AS vwap,
                    ROW_NUMBER() OVER (ORDER BY timestamp DESC) AS rn,
                    COUNT(*) OVER () AS total_count
                FROM gains_losses
            )
            SELECT 
                ticker_id,
                timestamp,
                close_price,
                sma_10,
                sma_50,
                sma_200,
                vwap,
                bb_middle,
                bb_middle + (2.0 * COALESCE(bb_stddev, 0)) AS bb_upper,
                bb_middle - (2.0 * COALESCE(bb_stddev, 0)) AS bb_lower,
                CASE 
                    WHEN avg_loss_14 = 0 OR avg_loss_14 IS NULL THEN 
                        CASE WHEN avg_gain_14 > 0 THEN 100.0 ELSE 50.0 END
                    ELSE 100.0 - (100.0 / (1.0 + (avg_gain_14 / avg_loss_14)))
                END AS rsi_14,
                total_count
            FROM avg_gains_losses
            WHERE rn = 1;
        """)

        res = await session.execute(query, {"symbol": symbol_upper})
        row = res.fetchone()

        if not row:
            return {
                "symbol": symbol_upper,
                "calculated_at": None,
                "data_points_analyzed": 0,
                "current_price": None,
                "indicators": {
                    "sma_10": None,
                    "sma_50": None,
                    "sma_200": None,
                    "ema_14": None,
                    "vwap": None,
                    "rsi_14": None,
                    "rsi_status": "INSUFFICIENT_DATA",
                    "bollinger_bands": {
                        "upper": None,
                        "middle": None,
                        "lower": None,
                        "bandwidth_pct": None,
                        "status": "INSUFFICIENT_DATA",
                    }
                },
                "crossover_signal": {
                    "status": "INSUFFICIENT_DATA",
                    "strength": "NEUTRAL",
                    "description": f"No pricing history recorded for ticker {symbol_upper}."
                }
            }

        ticker_id, timestamp, close_price, sma_10, sma_50, sma_200, vwap, bb_middle, bb_upper, bb_lower, rsi_14, total_count = row

        cp_val = safe_float(close_price) or 0.0
        sma_10_val = safe_float(sma_10)
        sma_50_val = safe_float(sma_50)
        sma_200_val = safe_float(sma_200)
        vwap_val = safe_float(vwap) or cp_val
        rsi_14_val = safe_float(rsi_14)
        bb_middle_val = safe_float(bb_middle)
        bb_upper_val = safe_float(bb_upper)
        bb_lower_val = safe_float(bb_lower)

        ema_14_val = sma_10_val

        # RSI status classification
        rsi_status = "NEUTRAL"
        if rsi_14_val is not None:
            if rsi_14_val >= 70.0:
                rsi_status = "OVERBOUGHT"
            elif rsi_14_val <= 30.0:
                rsi_status = "OVERSOLD"

        # Bollinger Bands status & bandwidth classification
        bb_status = "WITHIN_BANDS"
        bandwidth_pct = None
        if bb_upper_val is not None and bb_lower_val is not None and bb_middle_val is not None and bb_middle_val > 0:
            bandwidth_pct = ((bb_upper_val - bb_lower_val) / bb_middle_val) * 100.0
            if cp_val > bb_upper_val:
                bb_status = "ABOVE_UPPER"
            elif cp_val < bb_lower_val:
                bb_status = "BELOW_LOWER"

        # Crossover logic
        signal_status = "NEUTRAL"
        signal_strength = "NEUTRAL"
        description = "Indicator signals are balanced across windows."

        if sma_10_val and sma_200_val:
            if sma_10_val > sma_200_val:
                signal_status = "BULLISH_GOLDEN_CROSS"
                signal_strength = "STRONG"
                description = f"10-period SMA (${sma_10_val:.2f}) trades above 200-period SMA (${sma_200_val:.2f})."
            elif sma_10_val < sma_200_val:
                signal_status = "BEARISH_DEATH_CROSS"
                signal_strength = "STRONG"
                description = f"10-period SMA (${sma_10_val:.2f}) trades below 200-period SMA (${sma_200_val:.2f})."
        elif sma_10_val and sma_50_val:
            if sma_10_val > sma_50_val:
                signal_status = "BULLISH_SHORT_CROSS"
                signal_strength = "MODERATE"
                description = f"10-period SMA (${sma_10_val:.2f}) trades above 50-period SMA (${sma_50_val:.2f})."
            elif sma_10_val < sma_50_val:
                signal_status = "BEARISH_SHORT_CROSS"
                signal_strength = "MODERATE"
                description = f"10-period SMA (${sma_10_val:.2f}) trades below 50-period SMA (${sma_50_val:.2f})."

        # Upsert computed signals into database table
        if ticker_id and timestamp:
            try:
                stmt = pg_insert(ComputedSignal).values({
                    "ticker_id": ticker_id,
                    "timestamp": timestamp,
                    "rsi_14": Decimal(str(round(rsi_14_val, 4))) if rsi_14_val is not None else None,
                    "rsi_status": rsi_status,
                    "bollinger_upper": Decimal(str(round(bb_upper_val, 4))) if bb_upper_val is not None else None,
                    "bollinger_middle": Decimal(str(round(bb_middle_val, 4))) if bb_middle_val is not None else None,
                    "bollinger_lower": Decimal(str(round(bb_lower_val, 4))) if bb_lower_val is not None else None,
                    "bollinger_status": bb_status,
                    "bandwidth_pct": Decimal(str(round(bandwidth_pct, 4))) if bandwidth_pct is not None else None,
                }).on_conflict_do_update(
                    constraint="uix_computed_ticker_timestamp",
                    set_={
                        "rsi_14": Decimal(str(round(rsi_14_val, 4))) if rsi_14_val is not None else None,
                        "rsi_status": rsi_status,
                        "bollinger_upper": Decimal(str(round(bb_upper_val, 4))) if bb_upper_val is not None else None,
                        "bollinger_middle": Decimal(str(round(bb_middle_val, 4))) if bb_middle_val is not None else None,
                        "bollinger_lower": Decimal(str(round(bb_lower_val, 4))) if bb_lower_val is not None else None,
                        "bollinger_status": bb_status,
                        "bandwidth_pct": Decimal(str(round(bandwidth_pct, 4))) if bandwidth_pct is not None else None,
                    }
                )
                await session.execute(stmt)
                await session.commit()
            except Exception:
                await session.rollback()

        return {
            "symbol": symbol_upper,
            "calculated_at": timestamp.isoformat() if isinstance(timestamp, datetime) else str(timestamp) if timestamp else None,
            "data_points_analyzed": total_count,
            "current_price": cp_val,
            "indicators": {
                "sma_10": round(sma_10_val, 4) if sma_10_val is not None else None,
                "sma_50": round(sma_50_val, 4) if sma_50_val is not None else None,
                "sma_200": round(sma_200_val, 4) if sma_200_val is not None else None,
                "ema_14": round(ema_14_val, 4) if ema_14_val is not None else None,
                "vwap": round(vwap_val, 4) if vwap_val is not None else None,
                "rsi_14": round(rsi_14_val, 4) if rsi_14_val is not None else None,
                "rsi_status": rsi_status,
                "bollinger_bands": {
                    "upper": round(bb_upper_val, 4) if bb_upper_val is not None else None,
                    "middle": round(bb_middle_val, 4) if bb_middle_val is not None else None,
                    "lower": round(bb_lower_val, 4) if bb_lower_val is not None else None,
                    "bandwidth_pct": round(bandwidth_pct, 4) if bandwidth_pct is not None else None,
                    "status": bb_status,
                }
            },
            "crossover_signal": {
                "status": signal_status,
                "strength": signal_strength,
                "description": description
            }
        }

    @staticmethod
    async def compute_volatility_metrics(session: AsyncSession, symbol: str) -> Dict[str, Any]:
        symbol_upper = symbol.upper()

        query = text("""
            WITH raw_pricing AS (
                SELECT 
                    mp.ticker_id,
                    mp.timestamp,
                    mp.close_price,
                    DATE(mp.timestamp) AS price_date
                FROM market_pricing mp
                JOIN tickers t ON mp.ticker_id = t.id
                WHERE t.symbol = :symbol
            ),
            distinct_daily AS (
                SELECT DISTINCT ON (price_date)
                    ticker_id,
                    timestamp,
                    close_price
                FROM raw_pricing
                ORDER BY price_date DESC, timestamp DESC
            ),
            ordered_pricing AS (
                SELECT * FROM distinct_daily ORDER BY timestamp ASC
            ),
            daily_returns AS (
                SELECT 
                    ticker_id,
                    timestamp,
                    close_price,
                    MAX(close_price) OVER (ORDER BY timestamp ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS peak_price,
                    (close_price - LAG(close_price, 1) OVER (ORDER BY timestamp)) / 
                        NULLIF(LAG(close_price, 1) OVER (ORDER BY timestamp), 0) AS daily_return
                FROM ordered_pricing
            ),
            drawdowns AS (
                SELECT 
                    *,
                    ((close_price - peak_price) / NULLIF(peak_price, 0)) * 100.0 AS drawdown_pct
                FROM daily_returns
            ),
            rolling_metrics AS (
                SELECT 
                    ticker_id,
                    timestamp,
                    close_price,
                    drawdown_pct,
                    MIN(drawdown_pct) OVER () AS max_drawdown_pct,
                    AVG(daily_return) OVER (ORDER BY timestamp ROWS BETWEEN 29 PRECEDING AND CURRENT ROW) AS avg_return_30d,
                    STDDEV_SAMP(daily_return) OVER (ORDER BY timestamp ROWS BETWEEN 29 PRECEDING AND CURRENT ROW) AS stddev_return_30d,
                    ROW_NUMBER() OVER (ORDER BY timestamp DESC) AS rn,
                    COUNT(*) OVER () AS total_count
                FROM drawdowns
            )
            SELECT 
                ticker_id,
                timestamp,
                close_price,
                max_drawdown_pct,
                avg_return_30d,
                stddev_return_30d,
                total_count
            FROM rolling_metrics
            WHERE rn = 1;
        """)

        res = await session.execute(query, {"symbol": symbol_upper})
        row = res.fetchone()

        if not row:
            return {
                "symbol": symbol_upper,
                "calculated_at": None,
                "data_points_analyzed": 0,
                "volatility_30d_pct": None,
                "sharpe_ratio": None,
                "max_drawdown_pct": None,
                "risk_level": "NEUTRAL",
                "sharpe_rating": "NEUTRAL",
            }

        ticker_id, timestamp, close_price, max_dd, avg_ret, stddev_ret, total_count = row

        stddev_val = safe_float(stddev_ret) or 0.0
        avg_ret_val = safe_float(avg_ret) or 0.0
        max_dd_val = safe_float(max_dd) or 0.0

        volatility_30d_pct = stddev_val * math.sqrt(252) * 100.0
        annualized_return_pct = avg_ret_val * 252.0 * 100.0
        risk_free_rate = 4.0

        if volatility_30d_pct > 0:
            sharpe_ratio = (annualized_return_pct - risk_free_rate) / volatility_30d_pct
        else:
            sharpe_ratio = 0.0

        risk_level = "MODERATE_RISK"
        if volatility_30d_pct < 15.0:
            risk_level = "LOW_RISK"
        elif volatility_30d_pct > 30.0:
            risk_level = "HIGH_RISK"

        sharpe_rating = "SUBPAR"
        if sharpe_ratio >= 2.0:
            sharpe_rating = "EXCELLENT"
        elif sharpe_ratio >= 1.0:
            sharpe_rating = "GOOD"
        elif sharpe_ratio < 0.0:
            sharpe_rating = "NEGATIVE"

        return {
            "symbol": symbol_upper,
            "calculated_at": timestamp.isoformat() if isinstance(timestamp, datetime) else str(timestamp) if timestamp else None,
            "data_points_analyzed": total_count,
            "volatility_30d_pct": round(volatility_30d_pct, 2),
            "sharpe_ratio": round(sharpe_ratio, 2),
            "max_drawdown_pct": round(abs(max_dd_val), 2),
            "risk_level": risk_level,
            "sharpe_rating": sharpe_rating,
        }

    @staticmethod
    async def compute_correlation_matrix(
        session: AsyncSession,
        symbols: Optional[list[str]] = None,
        days: int = 30
    ) -> Dict[str, Any]:
        if not symbols:
            res_syms = await session.execute(text("SELECT symbol FROM tickers ORDER BY symbol ASC LIMIT 10;"))
            symbols = [r[0] for r in res_syms.fetchall()]
        else:
            symbols = [s.strip().upper() for s in symbols if s.strip()]

        if not symbols:
            return {
                "symbols": [],
                "matrix": {},
                "days_analyzed": days,
                "data_points_analyzed": 0,
            }

        query = text("""
            WITH raw_pricing AS (
                SELECT 
                    t.symbol,
                    mp.timestamp,
                    mp.close_price,
                    DATE(mp.timestamp) AS price_date
                FROM market_pricing mp
                JOIN tickers t ON mp.ticker_id = t.id
                WHERE t.symbol = ANY(:symbols)
                  AND mp.timestamp >= (CURRENT_TIMESTAMP - (:days * INTERVAL '1 day'))
            ),
            distinct_daily AS (
                SELECT DISTINCT ON (symbol, price_date)
                    symbol,
                    price_date,
                    close_price
                FROM raw_pricing
                ORDER BY symbol, price_date DESC, timestamp DESC
            ),
            paired AS (
                SELECT 
                    p1.symbol AS symbol_a,
                    p2.symbol AS symbol_b,
                    CORR(p1.close_price, p2.close_price) AS corr_val,
                    COUNT(*) AS pair_count
                FROM distinct_daily p1
                JOIN distinct_daily p2 ON p1.price_date = p2.price_date
                GROUP BY p1.symbol, p2.symbol
            )
            SELECT symbol_a, symbol_b, corr_val, pair_count FROM paired;
        """)

        res = await session.execute(query, {"symbols": symbols, "days": days})
        rows = res.fetchall()

        matrix: Dict[str, Dict[str, Optional[float]]] = {s: {s2: None for s2 in symbols} for s in symbols}
        total_points = 0

        for r in rows:
            sym_a, sym_b, corr, cnt = r
            if sym_a in matrix and sym_b in matrix[sym_a]:
                c_val = safe_float(corr)
                if c_val is not None:
                    c_val = round(c_val, 4)
                if sym_a == sym_b and c_val is not None:
                    c_val = 1.0
                matrix[sym_a][sym_b] = c_val
                total_points += cnt

        for s in symbols:
            if any(matrix[s][s2] is not None for s2 in symbols):
                matrix[s][s] = 1.0

        return {
            "symbols": symbols,
            "matrix": matrix,
            "days_analyzed": days,
            "data_points_analyzed": total_points,
        }

    @staticmethod
    async def compute_composite_signal(session: AsyncSession, symbol: str) -> Dict[str, Any]:
        symbol_upper = symbol.upper()

        indicators_res = await QuantitativeAnalyticsEngine.compute_indicators(session, symbol_upper)
        volatility_res = await QuantitativeAnalyticsEngine.compute_volatility_metrics(session, symbol_upper)

        indicators = indicators_res.get("indicators", {})
        crossover = indicators_res.get("crossover_signal", {})

        sma_signal = crossover.get("status", "NEUTRAL")
        rsi_val = indicators.get("rsi_14")
        bb_status = indicators.get("bollinger_bands", {}).get("status", "WITHIN_BANDS")
        sharpe_ratio = volatility_res.get("sharpe_ratio")

        sma_score = 50.0
        if sma_signal == "BULLISH_GOLDEN_CROSS":
            sma_score = 100.0
        elif sma_signal == "BULLISH_SHORT_CROSS":
            sma_score = 75.0
        elif sma_signal == "NEUTRAL":
            sma_score = 50.0
        elif sma_signal == "BEARISH_SHORT_CROSS":
            sma_score = 25.0
        elif sma_signal == "BEARISH_DEATH_CROSS":
            sma_score = 0.0

        rsi_score = 50.0
        if rsi_val is not None:
            if rsi_val <= 30.0:
                rsi_score = 90.0
            elif 30.0 < rsi_val <= 50.0:
                rsi_score = 50.0
            elif 50.0 < rsi_val < 70.0:
                rsi_score = 70.0
            elif rsi_val >= 70.0:
                rsi_score = 10.0

        bb_score = 50.0
        if bb_status == "BELOW_LOWER":
            bb_score = 90.0
        elif bb_status == "WITHIN_BANDS":
            bb_score = 50.0
        elif bb_status == "ABOVE_UPPER":
            bb_score = 10.0

        sharpe_score = 50.0
        if sharpe_ratio is not None:
            if sharpe_ratio >= 2.0:
                sharpe_score = 100.0
            elif sharpe_ratio >= 1.0:
                sharpe_score = 75.0
            elif sharpe_ratio >= 0.0:
                sharpe_score = 50.0
            else:
                sharpe_score = 10.0

        composite_score = (
            0.30 * sma_score +
            0.25 * rsi_score +
            0.25 * bb_score +
            0.20 * sharpe_score
        )

        # Risk-adjustment guard: severe drawdown or extreme volatility with negative Sharpe
        # penalizes false mean-reversion traps during an asset crash
        max_dd = volatility_res.get("max_drawdown_pct")
        if max_dd is not None and max_dd > 50.0 and (sharpe_ratio is None or sharpe_ratio < 0):
            composite_score = min(composite_score, 45.0)  # Cap at NEUTRAL / CAUTION during freefall
        elif max_dd is not None and max_dd > 35.0:
            composite_score = max(0.0, composite_score - 15.0)

        composite_score = round(composite_score, 2)

        if composite_score >= 75.0:
            recommendation = "STRONG_BUY"
        elif composite_score >= 60.0:
            recommendation = "BUY"
        elif composite_score >= 40.0:
            recommendation = "NEUTRAL"
        elif composite_score >= 25.0:
            recommendation = "SELL"
        else:
            recommendation = "STRONG_SELL"

        try:
            ver_res = await session.execute(
                text("SELECT COALESCE(MAX(version), 0) + 1 FROM signal_snapshots WHERE ticker = :sym"),
                {"sym": symbol_upper}
            )
            next_ver = ver_res.scalar() or 1

            await session.execute(
                text("""
                    INSERT INTO signal_snapshots 
                    (ticker, composite_score, recommendation, rsi_14, volatility_30d_pct, sharpe_ratio, version)
                    VALUES (:ticker, :score, :rec, :rsi, :vol, :sharpe, :ver);
                """),
                {
                    "ticker": symbol_upper,
                    "score": composite_score,
                    "rec": recommendation,
                    "rsi": rsi_val,
                    "vol": volatility_res.get("volatility_30d_pct"),
                    "sharpe": sharpe_ratio,
                    "ver": next_ver
                }
            )
            await session.commit()
        except Exception:
            await session.rollback()

        return {
            "symbol": symbol_upper,
            "calculated_at": indicators_res.get("calculated_at"),
            "data_points_analyzed": indicators_res.get("data_points_analyzed", 0),
            "composite_score": composite_score,
            "recommendation": recommendation,
            "components": {
                "sma_crossover": {
                    "signal": sma_signal,
                    "score": round(sma_score, 1),
                    "weight": 0.30,
                },
                "rsi_14": {
                    "val": rsi_val,
                    "status": indicators.get("rsi_status", "NEUTRAL"),
                    "score": round(rsi_score, 1),
                    "weight": 0.25,
                },
                "bollinger_bands": {
                    "status": bb_status,
                    "score": round(bb_score, 1),
                    "weight": 0.25,
                },
                "sharpe_ratio": {
                    "val": sharpe_ratio,
                    "rating": volatility_res.get("sharpe_rating", "SUBPAR"),
                    "score": round(sharpe_score, 1),
                    "weight": 0.20,
                }
            }
        }

    @staticmethod
    async def get_snapshots(session: AsyncSession, symbol: str, limit: int = 10) -> Dict[str, Any]:
        symbol_upper = symbol.upper()
        res = await session.execute(
            text("""
                SELECT version, timestamp, composite_score, recommendation, rsi_14, volatility_30d_pct, sharpe_ratio
                FROM signal_snapshots
                WHERE ticker = :sym
                ORDER BY version DESC LIMIT :limit;
            """),
            {"sym": symbol_upper, "limit": limit}
        )
        rows = res.fetchall()
        snapshots = []
        for r in rows:
            snapshots.append({
                "version": r[0],
                "timestamp": r[1].isoformat() if r[1] else None,
                "composite_score": safe_float(r[2]),
                "recommendation": r[3],
                "rsi_14": safe_float(r[4]),
                "volatility_30d_pct": safe_float(r[5]),
                "sharpe_ratio": safe_float(r[6]),
            })
        return {
            "symbol": symbol_upper,
            "total_snapshots": len(snapshots),
            "snapshots": snapshots
        }

    @staticmethod
    async def get_snapshot_diff(session: AsyncSession, symbol: str) -> Dict[str, Any]:
        symbol_upper = symbol.upper()
        res = await session.execute(
            text("""
                SELECT version, timestamp, composite_score, recommendation, rsi_14, volatility_30d_pct, sharpe_ratio
                FROM signal_snapshots
                WHERE ticker = :sym
                ORDER BY version DESC LIMIT 2;
            """),
            {"sym": symbol_upper}
        )
        rows = res.fetchall()
        if not rows:
            return {
                "symbol": symbol_upper,
                "has_diff": False,
                "message": "No snapshots recorded yet for this ticker."
            }
        
        current = rows[0]
        previous = rows[1] if len(rows) > 1 else rows[0]
        
        c_score = safe_float(current[2]) or 0.0
        p_score = safe_float(previous[2]) or 0.0
        score_diff = round(c_score - p_score, 2)
        
        c_rsi = safe_float(current[4]) or 0.0
        p_rsi = safe_float(previous[4]) or 0.0
        rsi_diff = round(c_rsi - p_rsi, 2)
        
        c_vol = safe_float(current[5]) or 0.0
        p_vol = safe_float(previous[5]) or 0.0
        vol_diff = round(c_vol - p_vol, 2)
        
        rec_changed = (current[3] != previous[3])
        
        return {
            "symbol": symbol_upper,
            "has_diff": len(rows) > 1,
            "current_version": current[0],
            "previous_version": previous[0],
            "current_snapshot": {
                "version": current[0],
                "timestamp": current[1].isoformat() if current[1] else None,
                "composite_score": c_score,
                "recommendation": current[3],
                "rsi_14": c_rsi,
                "volatility_30d_pct": c_vol,
                "sharpe_ratio": safe_float(current[6])
            },
            "previous_snapshot": {
                "version": previous[0],
                "timestamp": previous[1].isoformat() if previous[1] else None,
                "composite_score": p_score,
                "recommendation": previous[3],
                "rsi_14": p_rsi,
                "volatility_30d_pct": p_vol,
                "sharpe_ratio": safe_float(previous[6])
            },
            "deltas": {
                "composite_score_delta": score_diff,
                "rsi_14_delta": rsi_diff,
                "volatility_delta": vol_diff,
                "recommendation_changed": rec_changed,
                "recommendation_from": previous[3],
                "recommendation_to": current[3]
            }
        }

    @staticmethod
    async def run_backtest(
        session: AsyncSession,
        symbol: str,
        initial_capital: float = 10000.0,
        strategy: str = "SMA_CROSSOVER",
        days: int = 90
    ) -> Dict[str, Any]:
        symbol_upper = symbol.upper()
        query = text("""
            WITH raw_pricing AS (
                SELECT 
                    mp.timestamp,
                    mp.close_price,
                    DATE(mp.timestamp) AS price_date
                FROM market_pricing mp
                JOIN tickers t ON mp.ticker_id = t.id
                WHERE t.symbol = :symbol
            ),
            distinct_daily AS (
                SELECT DISTINCT ON (price_date)
                    price_date,
                    timestamp,
                    close_price
                FROM raw_pricing
                ORDER BY price_date DESC, timestamp DESC
                LIMIT :days
            )
            SELECT timestamp, close_price FROM distinct_daily ORDER BY timestamp ASC;
        """)
        res = await session.execute(query, {"symbol": symbol_upper, "days": days})
        rows = res.fetchall()

        if not rows or len(rows) < 2:
            return {
                "symbol": symbol_upper,
                "strategy": strategy,
                "initial_capital": initial_capital,
                "final_equity": initial_capital,
                "strategy_return_pct": 0.0,
                "benchmark_return_pct": 0.0,
                "alpha_pct": 0.0,
                "sharpe_ratio": 0.0,
                "max_drawdown_pct": 0.0,
                "total_trades": 0,
                "winning_trades": 0,
                "win_rate_pct": 0.0,
                "equity_curve": []
            }

        prices = [safe_float(r[1]) or 0.0 for r in rows]
        dates = [r[0].strftime("%Y-%m-%d") if hasattr(r[0], "strftime") else str(r[0])[:10] for r in rows]

        sma10 = []
        sma50 = []
        for i in range(len(prices)):
            sma10.append(sum(prices[max(0, i-9):i+1]) / min(i+1, 10))
            sma50.append(sum(prices[max(0, i-49):i+1]) / min(i+1, 50))

        cash = initial_capital
        position = 0.0
        trades = 0
        winning_trades = 0
        entry_price = 0.0

        benchmark_shares = initial_capital / prices[0] if prices[0] > 0 else 0
        equity_curve = []
        peak_equity = initial_capital
        max_drawdown = 0.0
        daily_returns = []

        for i in range(len(prices)):
            price = prices[i]
            date_str = dates[i]

            signal_buy = False
            signal_sell = False

            if strategy == "SMA_CROSSOVER":
                if sma10[i] > sma50[i]:
                    signal_buy = True
                elif sma10[i] < sma50[i]:
                    signal_sell = True
            elif strategy == "RSI_THRESHOLD":
                if price > sma10[i]:
                    signal_buy = True
                else:
                    signal_sell = True
            else:
                if sma10[i] >= sma50[i]:
                    signal_buy = True
                else:
                    signal_sell = True

            action = "HOLD"
            if signal_buy and position == 0 and price > 0:
                position = cash / price
                cash = 0.0
                entry_price = price
                trades += 1
                action = "BUY"
            elif signal_sell and position > 0 and price > 0:
                current_value = position * price
                if price > entry_price:
                    winning_trades += 1
                cash = current_value
                position = 0.0
                trades += 1
                action = "SELL"

            current_equity = cash + (position * price)
            benchmark_equity = benchmark_shares * price

            if i > 0:
                prev_eq = equity_curve[-1]["equity"]
                if prev_eq > 0:
                    ret = (current_equity - prev_eq) / prev_eq
                    daily_returns.append(ret)

            if current_equity > peak_equity:
                peak_equity = current_equity
            dd = ((peak_equity - current_equity) / peak_equity) * 100.0 if peak_equity > 0 else 0.0
            if dd > max_drawdown:
                max_drawdown = dd

            equity_curve.append({
                "date": date_str,
                "price": round(price, 2),
                "equity": round(current_equity, 2),
                "benchmark_equity": round(benchmark_equity, 2),
                "action": action
            })

        final_equity = equity_curve[-1]["equity"]
        strategy_return_pct = round(((final_equity - initial_capital) / initial_capital) * 100.0, 2)
        final_benchmark = equity_curve[-1]["benchmark_equity"]
        benchmark_return_pct = round(((final_benchmark - initial_capital) / initial_capital) * 100.0, 2)
        alpha_pct = round(strategy_return_pct - benchmark_return_pct, 2)
        win_rate_pct = round((winning_trades / trades) * 100.0, 2) if trades > 0 else 0.0

        sharpe_ratio = 0.0
        if daily_returns and len(daily_returns) > 1:
            import statistics
            avg_r = sum(daily_returns) / len(daily_returns)
            std_r = statistics.stdev(daily_returns)
            if std_r > 0:
                sharpe_ratio = round((avg_r * math.sqrt(252)) / (std_r * math.sqrt(252)), 2)

        return {
            "symbol": symbol_upper,
            "strategy": strategy,
            "initial_capital": initial_capital,
            "final_equity": round(final_equity, 2),
            "strategy_return_pct": strategy_return_pct,
            "benchmark_return_pct": benchmark_return_pct,
            "alpha_pct": alpha_pct,
            "sharpe_ratio": sharpe_ratio,
            "max_drawdown_pct": round(max_drawdown, 2),
            "total_trades": trades,
            "winning_trades": winning_trades,
            "win_rate_pct": win_rate_pct,
            "equity_curve": equity_curve
        }

    SECTOR_MAP = {
        "Technology": ["AAPL", "MSFT", "NVDA", "AMD", "INTC"],
        "Consumer Discretionary": ["TSLA", "AMZN"],
        "Communication Services": ["GOOGL", "META", "NFLX"]
    }

    @staticmethod
    async def compute_sector_rotation(session: AsyncSession, days: int = 30) -> Dict[str, Any]:
        sectors = []
        for sector_name, symbols in QuantitativeAnalyticsEngine.SECTOR_MAP.items():
            ticker_scores = []
            sector_returns = []
            top_ticker = None
            top_return = -999.0

            for sym in symbols:
                comp = await QuantitativeAnalyticsEngine.compute_composite_signal(session, sym)
                
                res = await session.execute(text("""
                    WITH raw_p AS (
                        SELECT mp.close_price, DATE(mp.timestamp) as p_date
                        FROM market_pricing mp JOIN tickers t ON mp.ticker_id = t.id
                        WHERE t.symbol = :sym
                        ORDER BY mp.timestamp DESC LIMIT :days
                    )
                    SELECT 
                        (FIRST_VALUE(close_price) OVER (ORDER BY p_date DESC) - 
                         LAST_VALUE(close_price) OVER (ORDER BY p_date DESC)) / 
                         NULLIF(LAST_VALUE(close_price) OVER (ORDER BY p_date DESC), 0) * 100.0
                    FROM raw_p LIMIT 1;
                """), {"sym": sym, "days": days})
                row = res.fetchone()
                ret_pct = safe_float(row[0]) if row else 0.0
                if ret_pct is None: ret_pct = 0.0

                score = comp.get("composite_score", 50.0)
                ticker_scores.append(score)
                sector_returns.append(ret_pct)

                if ret_pct > top_return:
                    top_return = ret_pct
                    top_ticker = sym

            avg_score = round(sum(ticker_scores) / len(ticker_scores), 2) if ticker_scores else 50.0
            avg_return = round(sum(sector_returns) / len(sector_returns), 2) if sector_returns else 0.0

            rotation_status = "NEUTRAL"
            if avg_score >= 65.0 and avg_return >= 2.0:
                rotation_status = "OUTPERFORMING"
            elif avg_score >= 55.0:
                rotation_status = "INFLOW"
            elif avg_score <= 35.0 or avg_return <= -2.0:
                rotation_status = "UNDERPERFORMING"
            else:
                rotation_status = "OUTFLOW"

            sectors.append({
                "sector": sector_name,
                "symbols": symbols,
                "avg_composite_score": avg_score,
                "avg_return_pct": avg_return,
                "rotation_status": rotation_status,
                "top_performing_symbol": top_ticker or symbols[0],
                "top_symbol_return_pct": round(top_return, 2) if top_return != -999.0 else 0.0
            })

        return {
            "days_analyzed": days,
            "total_sectors": len(sectors),
            "sectors": sectors
        }



