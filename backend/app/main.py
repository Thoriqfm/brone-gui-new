from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.websocket import router as websocket_router
from app.api.health import router as health_router

app = FastAPI(title='Brone GUI Backend', version='0.1.0')
app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:5173','http://127.0.0.1:5173'], allow_methods=['GET','POST'], allow_headers=['*'])
app.include_router(health_router)
app.include_router(websocket_router)
