from fastapi import APIRouter, HTTPException, Request
from app.schemas.messages import ExpressionMessage, ExpressionRequest
from app.services.face_command import ALLOWED_ORIGINS

router = APIRouter(prefix='/api/face', tags=['face'])


@router.get('/state', response_model=ExpressionMessage)
async def face_state(request: Request):
    return request.app.state.face_commands.latest


@router.post('/expression', responses={403: {'description': 'Browser origin not allowed'}})
async def set_expression(message: ExpressionRequest, request: Request):
    origin = request.headers.get('origin')
    if origin is not None and origin not in ALLOWED_ORIGINS:
        raise HTTPException(status_code=403, detail='Origin not allowed')
    command = ExpressionMessage.model_validate(message.model_dump())
    clients = await request.app.state.face_commands.publish(command)
    return {'status': 'accepted', 'request_id': message.request_id, 'connected_clients': clients}
