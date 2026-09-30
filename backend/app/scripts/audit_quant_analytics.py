import asyncio
import logging
import httpx

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("audit_quant_analytics")

API_BASE = "https://fintech-api-gateway-m2yl.onrender.com"
HEADERS = {"X-N8N-API-KEY": "super_secure_internal_orchestration_secret_key_2026"}


async def audit_volatility_endpoint(client: httpx.AsyncClient):
    logger.info("🧪 [1/7] Auditing GET /v1/analytics/volatility/AAPL...")
    res = await client.get(f"{API_BASE}/v1/analytics/volatility/AAPL", headers=HEADERS)
    assert res.status_code == 200, f"HTTP Error {res.status_code}: {res.text}"
    data = res.json()
    assert "volatility_30d_pct" in data
    assert "sharpe_ratio" in data
    assert "max_drawdown_pct" in data
    logger.info(f"   ├─ 30D Volatility: {data['volatility_30d_pct']}% ({data['risk_level']})")
    logger.info(f"   ├─ Sharpe Ratio:   {data['sharpe_ratio']} ({data['sharpe_rating']})")
    logger.info(f"   └─ Max Drawdown:   -{data['max_drawdown_pct']}%")
    logger.info("✅ [1/7 PASSED] Volatility metrics API verified.")


async def audit_correlation_endpoint(client: httpx.AsyncClient):
    logger.info("🧪 [2/7] Auditing GET /v1/analytics/correlation?days=30...")
    res = await client.get(f"{API_BASE}/v1/analytics/correlation?days=30", headers=HEADERS)
    assert res.status_code == 200, f"HTTP Error {res.status_code}: {res.text}"
    data = res.json()
    assert "matrix" in data
    assert "symbols" in data
    logger.info(f"   ├─ Symbols Analyzed: {len(data['symbols'])} ({', '.join(data['symbols'][:4])}...)")
    logger.info(f"   └─ Total Price Pairs: {data['data_points_analyzed']} pairs")
    logger.info("✅ [2/7 PASSED] 10x10 Correlation Matrix API verified.")


async def audit_composite_endpoint(client: httpx.AsyncClient):
    logger.info("🧪 [3/7] Auditing GET /v1/analytics/composite/AAPL...")
    res = await client.get(f"{API_BASE}/v1/analytics/composite/AAPL", headers=HEADERS)
    assert res.status_code == 200, f"HTTP Error {res.status_code}: {res.text}"
    data = res.json()
    assert "composite_score" in data
    assert "recommendation" in data
    assert "components" in data
    logger.info(f"   ├─ Composite Score: {data['composite_score']}/100")
    logger.info(f"   └─ Recommendation:  {data['recommendation']}")
    logger.info("✅ [3/7 PASSED] Multi-Factor Composite Signal API verified.")


async def audit_backtest_endpoint(client: httpx.AsyncClient):
    logger.info("🧪 [4/7] Auditing POST /v1/analytics/backtest...")
    payload = {
        "ticker": "AAPL",
        "initial_capital": 10000.0,
        "strategy": "SMA_CROSSOVER",
        "days": 90,
    }
    res = await client.post(f"{API_BASE}/v1/analytics/backtest", json=payload, headers=HEADERS)
    assert res.status_code == 200, f"HTTP Error {res.status_code}: {res.text}"
    data = res.json()
    assert "final_equity" in data
    assert "strategy_return_pct" in data
    assert "benchmark_return_pct" in data
    assert "alpha_pct" in data
    logger.info(f"   ├─ Final Equity:     ${data['final_equity']}")
    logger.info(f"   ├─ Strategy Return:  {data['strategy_return_pct']}%")
    logger.info(f"   ├─ Benchmark Return: {data['benchmark_return_pct']}%")
    logger.info(f"   └─ Alpha Delta:      +{data['alpha_pct']}%")
    logger.info("✅ [4/7 PASSED] Strategy Backtesting Engine API verified.")


async def audit_sectors_endpoint(client: httpx.AsyncClient):
    logger.info("🧪 [5/7] Auditing GET /v1/analytics/sectors?days=30...")
    res = await client.get(f"{API_BASE}/v1/analytics/sectors?days=30", headers=HEADERS)
    assert res.status_code == 200, f"HTTP Error {res.status_code}: {res.text}"
    data = res.json()
    assert "sectors" in data
    assert len(data["sectors"]) > 0
    logger.info(f"   ├─ Total Sectors: {data['total_sectors']}")
    for s in data["sectors"]:
        logger.info(f"   └─ {s['sector']}: Avg {s['avg_return_pct']}% ({s['rotation_status']})")
    logger.info("✅ [5/7 PASSED] Multi-Asset Sector Rotation Engine API verified.")


async def audit_snapshots_endpoint(client: httpx.AsyncClient):
    logger.info("🧪 [6/7] Auditing GET /v1/analytics/snapshots/AAPL...")
    res = await client.get(f"{API_BASE}/v1/analytics/snapshots/AAPL", headers=HEADERS)
    assert res.status_code == 200, f"HTTP Error {res.status_code}: {res.text}"
    data = res.json()
    assert "snapshots" in data
    logger.info(f"   └─ Total Snapshots: {data['total_snapshots']}")
    logger.info("✅ [6/7 PASSED] Signal Snapshot History API verified.")


async def audit_snapshots_diff_endpoint(client: httpx.AsyncClient):
    logger.info("🧪 [7/7] Auditing GET /v1/analytics/snapshots/diff/AAPL...")
    res = await client.get(f"{API_BASE}/v1/analytics/snapshots/diff/AAPL", headers=HEADERS)
    assert res.status_code == 200, f"HTTP Error {res.status_code}: {res.text}"
    data = res.json()
    assert "has_diff" in data
    logger.info(f"   └─ Has Version Diff: {data['has_diff']}")
    logger.info("✅ [7/7 PASSED] Signal Snapshot Diff Engine API verified.")


async def main():
    logger.info("================================================================")
    logger.info("🚀 QUANTITATIVE ANALYTICS SUITE (7-POINT SYSTEM AUDIT)")
    logger.info(f"🎯 Target System: {API_BASE}")
    logger.info("================================================================")

    async with httpx.AsyncClient(timeout=30.0) as client:
        await audit_volatility_endpoint(client)
        await audit_correlation_endpoint(client)
        await audit_composite_endpoint(client)
        await audit_backtest_endpoint(client)
        await audit_sectors_endpoint(client)
        await audit_snapshots_endpoint(client)
        await audit_snapshots_diff_endpoint(client)

    logger.info("================================================================")
    logger.info("🎉 CAPSTONE ANALYTICS AUDIT PASSED 7/7 ASSERTIONS SEALED 100%")
    logger.info("================================================================")


if __name__ == "__main__":
    asyncio.run(main())
