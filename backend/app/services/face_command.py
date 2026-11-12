import asyncio
import logging

from fastapi import WebSocket, WebSocketDisconnect
from app.schemas.messages import ExpressionMessage, ExpressionPayload

logger = logging.getLogger(__name__)
ALLOWED_ORIGINS = [
    'http://localhost:5173', 'http://127.0.0.1:5173',
    'http://localhost:8000', 'http://127.0.0.1:8000',  # Local Swagger UI.
]


class FaceCommands:
    def __init__(self):
        self.latest = ExpressionMessage(
            type='SET_EXPRESSION', request_id='initial',
            payload=ExpressionPayload(emotion='idle', intensity=0.5, transition_ms=0),
        )
        self.clients: set[WebSocket] = set()
        # ponytail: one in-memory process; use shared state/pubsub before multiple workers.
        self.lock = asyncio.Lock()
        self.reset_task: asyncio.Task | None = None

    async def _send(self, ws: WebSocket):
        try:
            await asyncio.wait_for(ws.send_text(self.latest.model_dump_json()), timeout=2)
        except (WebSocketDisconnect, RuntimeError, OSError, asyncio.TimeoutError):
            self.clients.discard(ws)
            try:
                await asyncio.wait_for(ws.close(code=1011), timeout=2)
            except (WebSocketDisconnect, RuntimeError, OSError, asyncio.TimeoutError):
                pass

    async def connect(self, ws: WebSocket):
        async with self.lock:
            await ws.accept()
            self.clients.add(ws)
            await self._send(ws)

    async def publish(self, message: ExpressionMessage, *, reset_after: float | None = None):
        async with self.lock:
            if self.reset_task and self.reset_task is not asyncio.current_task():
                self.reset_task.cancel()
            self.reset_task = None
            self.latest = message
            if reset_after is not None:
                self.reset_task = asyncio.create_task(self._reset_after(reset_after))
            await asyncio.gather(*(self._send(ws) for ws in tuple(self.clients)))
            logger.info('face_command accepted request_id=%s emotion=%s clients=%s',
                        message.request_id, message.payload.emotion, len(self.clients))
            return len(self.clients)

    async def _reset_after(self, seconds: float):
        await asyncio.sleep(seconds)
        await self.publish(ExpressionMessage(
            type='SET_EXPRESSION', request_id=f'{self.latest.request_id}-idle',
            payload=ExpressionPayload(emotion='idle', intensity=1, transition_ms=700)))

    async def stop(self):
        if self.reset_task:
            self.reset_task.cancel()
            await asyncio.gather(self.reset_task, return_exceptions=True)
            self.reset_task = None
