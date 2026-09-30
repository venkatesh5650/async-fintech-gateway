import os
import asyncio
import logging
from app.database.schemas import MarketDataPayload
from app.routers.market import fetch_live_market_content

logger = logging.getLogger(__name__)


class MarketPollerWorker:
    def __init__(self):
        raw_tickers = os.getenv("MARKET_POLL_TICKERS", "AAPL,TSLA,MSFT,NVDA,GOOGL")
        self.tickers = [t.strip().upper() for t in raw_tickers.split(",") if t.strip()]
        self.interval = int(os.getenv("MARKET_POLL_INTERVAL_SEC", "60"))
        self.stagger_delay = float(os.getenv("MARKET_POLL_STAGGER_SEC", "5"))
        self._is_running = False

    async def run(self):
        self._is_running = True
        logger.info(
            f"🚀 [MARKET POLLER] Daemon initialized. Watching tickers: {self.tickers} (Interval: {self.interval}s)"
        )

        while self._is_running:
            try:
                for ticker in self.tickers:
                    if not self._is_running:
                        break

                    payload = MarketDataPayload(ticker=ticker, asset_class="EQUITY", current_price=1.0, volume=1000)

                    try:
                        await fetch_live_market_content(payload)
                        logger.info(f"📈 [MARKET POLLER] Polling complete for {ticker}")
                    except Exception as e:
                        logger.warning(f"⚠️ [MARKET POLLER] Failed polling for {ticker}: {e}")

                    await asyncio.sleep(self.stagger_delay)

                await asyncio.sleep(max(1.0, self.interval - (len(self.tickers) * self.stagger_delay)))
            except asyncio.CancelledError:
                logger.info("🛑 [MARKET POLLER] Cancellation signal received.")
                break
            except Exception as exc:
                logger.error(f"❌ [MARKET POLLER] Unexpected error in polling cycle: {exc}")
                await asyncio.sleep(5)

    async def shutdown(self):
        self._is_running = False
        logger.info("🛑 [MARKET POLLER] Shutdown requested.")
