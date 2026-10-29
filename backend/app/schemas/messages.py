from typing import Literal
from pydantic import BaseModel, Field

Emotion = Literal['idle','happy','happier','sad','cry','shock','shy','thinking']

class ExpressionPayload(BaseModel):
    emotion: Emotion
    intensity: float = Field(ge=0, le=1)
    transition_ms: int = Field(default=250, ge=0)

class ExpressionMessage(BaseModel):
    type: Literal['SET_EXPRESSION'] = 'SET_EXPRESSION'
    request_id: str
    payload: ExpressionPayload
