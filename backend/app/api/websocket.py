import asyncio
import itertools
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.schemas.messages import ExpressionMessage, ExpressionPayload

router = APIRouter()
sequence = itertools.count(1)

@router.websocket('/ws/face')
async def face_socket(ws: WebSocket):
    # Local-only development prototype. Add authentication before exposing beyond localhost.
    await ws.accept()
    emotions = ['idle','happy','sad','thinking','shock']
    try:
        while True:
            for emotion in emotions:
                message = ExpressionMessage(request_id=f'demo-{next(sequence)}',payload=ExpressionPayload(emotion=emotion,intensity=0.7,transition_ms=300))
                await ws.send_text(message.model_dump_json())
                await asyncio.sleep(3)
    except WebSocketDisconnect:
        pass
    except (RuntimeError, OSError):
        pass
