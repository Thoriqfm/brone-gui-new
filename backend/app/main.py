from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.websocket import router as websocket_router
from app.api.health import router as health_router
from app.api.face import router as face_router
from app.services.face_command import ALLOWED_ORIGINS, FaceCommands
from app.services.mqtt_ingress import MqttIngress, MqttSettings

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.face_commands = FaceCommands()
    settings = MqttSettings.from_env()
    ingress = MqttIngress(settings, app.state.face_commands) if settings.enabled else None
    app.state.mqtt = ingress
    try:
        if ingress:
            ingress.start()
        yield
    finally:
        if ingress:
            await ingress.stop()
        await app.state.face_commands.stop()

app = FastAPI(title='Brone GUI Backend', version='0.1.0', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_methods=['GET','POST'], allow_headers=['*'])
app.include_router(health_router)
app.include_router(websocket_router)
app.include_router(face_router)
