from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import logging
import json

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
logger.propagate = True

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

manager = ConnectionManager()

@router.websocket("/jobs/{job_id}")
async def websocket_job_endpoint(websocket: WebSocket, job_id: str):
    print(f">>> WS HANDLER ENTERED for {job_id}", flush=True)
    await manager.connect(job_id, websocket)
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