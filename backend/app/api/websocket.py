from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services.face_command import ALLOWED_ORIGINS

router = APIRouter()

@router.websocket('/ws/face')
async def face_socket(ws: WebSocket):
    origin = ws.headers.get('origin')
    if origin is not None and origin not in ALLOWED_ORIGINS:
        await ws.close(code=1008)
        return
    commands = ws.app.state.face_commands
    await commands.connect(ws)
    try:
        while True:
            await ws.receive_text()
            # Commands enter through validated HTTP, not this display connection.
            await ws.close(code=1008)
            break
    except WebSocketDisconnect:
        pass
    except (RuntimeError, OSError):
        pass
    finally:
        commands.clients.discard(ws)
