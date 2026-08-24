import httpx
import logging
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

logger = logging.getLogger(__name__)

# --- CONFIGURATION ---
# Replace with your actual Discord URL
DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1534885356732678234/Uru9TNOLAJp7zybqXgDW9gKuNZ6mtk4TzVEE8xRt4Sn8mSxZSx-3XdZBKIoeTtsklASQ"
# Replace with your actual n8n webhook URL
N8N_WEBHOOK_URL = "http://host.docker.internal:5678/webhook/finance-alert" 


async def send_to_discord_dlq(payload: dict, error_msg: str):
    """The final safety net. Bypasses n8n entirely."""
    async with httpx.AsyncClient() as client:
        dlq_payload = {
            "content": f"🚨 **FASTAPI NATIVE DLQ ALERT** 🚨\n**Orchestration Error:** {error_msg}\n**Recovered Payload Ticker:** {payload.get('ticker', 'Unknown')}"
        }
        try:
            await client.post(DISCORD_WEBHOOK_URL, json=dlq_payload)
            logger.warning("DLQ payload successfully routed to Discord.")
        except Exception as e:
            logger.error(f"FATAL: DLQ also failed. {e}")


@retry(
    stop=stop_after_attempt(3),
    # Exponential backoff: waits 2s, then 4s, up to max 10s
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type((httpx.RequestError, httpx.HTTPStatusError)),
    reraise=True
)
async def emit_to_n8n_with_retry(payload: dict):
    """Attempts to send data to n8n. Retries autonomously on network failure."""
    async with httpx.AsyncClient() as client:
        logger.info(f"Attempting to broadcast payload to n8n for {payload.get('ticker')}")
        response = await client.post(N8N_WEBHOOK_URL, json=payload, timeout=5.0)
        response.raise_for_status()  # Forces a retry if n8n returns 500


async def broadcast_intelligence_result(payload: dict):
    """The main wrapper function to call from your background task."""

    try:
        await emit_to_n8n_with_retry(payload)
        logger.info("Successfully emitted intelligence payload to n8n.")
    except Exception as e:
        logger.error(f"n8n Orchestration Failed after 3 retries: {e}. Routing to Native DLQ.")
        await send_to_discord_dlq(payload, str(e))