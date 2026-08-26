from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import logging
import json
import redis.asyncio as redis
import os

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
logger.propagate = True

REDIS_URL = os.getenv("REDIS_URL", "redis://fintech_redis:6379/0")
redis_client = redis.from_url(REDIS_URL, decode_responses=True)

router = APIRouter(prefix="/v1/ws", tags=["WebSockets"])

class ConnectionManager:
    def __init__(self):
        # Maps active TCP sockets directly to unique job_ids for O(1) routing
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, job_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[job_id] = websocket
        logger.info(f"[WS] Secure connection established for Job ID: {job_id}")

    def disconnect(self, job_id: str):
        if job_id in self.active_connections:
            del self.active_connections[job_id]
            logger.info(f"[WS] Connection pruned for Job ID: {job_id}")

    async def send_personal_message(self, message: dict, job_id: str):
        if job_id in self.active_connections:
            websocket = self.active_connections[job_id]
            await websocket.send_text(json.dumps(message))

    async def broadcast(self, message: dict):
        """
        Broadcasts a message payload to all actively connected WebSockets.
        Gracefully catches disconnected sockets to prevent pipeline failures.
        """
        dead_connections = []
        for job_id, websocket in list(self.active_connections.items()):
            try:
                await websocket.send_text(json.dumps(message))
            except Exception as e:
                logger.warning(f"[WS] Failed to broadcast frame to Job ID {job_id}: {str(e)}")
                dead_connections.append(job_id)

        for dead_id in dead_connections:
            self.disconnect(dead_id)

manager = ConnectionManager()

@router.websocket("/jobs/{job_id}")
async def websocket_job_endpoint(websocket: WebSocket, job_id: str):
    print(f">>> WS HANDLER ENTERED for {job_id}", flush=True)
    await manager.connect(job_id, websocket)

    # Immediately attempt to push cached state to prevent delivery race conditions
    try:
        cached_data = await redis_client.get(job_id)
        if cached_data:
            payload = json.loads(cached_data)
            await websocket.send_text(json.dumps(payload))
            logger.info(f"[WS] Dispatched initial state from Redis cache for Job ID: {job_id}")
    except Exception as redis_err:
        # Fail-Open: log error but allow websocket transmission stream to remain active
        logger.error(f"[WS] Fail-open on Redis status cache read error for Job ID {job_id}: {str(redis_err)}")

    try:
        while True:
            # Keep the socket open and listen for client pings
            data = await websocket.receive_text()
            logger.info(f"[WS] Raw frame received for Job ID {job_id}: {data!r}")

            try:
                payload = json.loads(data)
                logger.info(f"[WS] Parsed payload: {payload}")
                if payload.get("type") == "ping":
                    # Fire the pong immediately to reset the proxy's idle timer
                    await websocket.send_text(json.dumps({"type": "pong"}))
                    logger.info(f"[WS] Heartbeat echoed (pong) for Job ID: {job_id}")
            except json.JSONDecodeError:
                logger.warning(f"[WS] Unrecognized non-JSON frame received: {data}")

    except WebSocketDisconnect:
        manager.disconnect(job_id)
    except Exception as e:
        logger.error(f"[WS] Unhandled transmission error for Job ID {job_id}: {str(e)}")
        manager.disconnect(job_id)