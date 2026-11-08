from fastapi import APIRouter, Request
router = APIRouter()
@router.get('/health')
def health(request: Request):
    mqtt = request.app.state.mqtt
    return {'status': 'ok', 'service': 'brone-gui-backend', 'mqtt': {
        'enabled': mqtt is not None,
        'connected': mqtt.connected if mqtt else False,
        'subscribed': mqtt.subscribed if mqtt else False,
    }}
