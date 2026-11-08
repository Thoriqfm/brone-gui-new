from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

Emotion = Literal['idle','happy','happier','sad','cry','shock','thinking','timeout']

class StrictModel(BaseModel):
    model_config = ConfigDict(strict=True, extra='forbid', allow_inf_nan=False)

class ExpressionPayload(StrictModel):
    emotion: Emotion
    intensity: float = Field(ge=0, le=1)
    transition_ms: int = Field(ge=0)

class ExpressionMessage(StrictModel):
    type: Literal['SET_EXPRESSION']
    request_id: str
    payload: ExpressionPayload


# HTTP ingress defaults; canonical WebSocket messages remain fully required.
class ExpressionRequestPayload(ExpressionPayload):
    intensity: float = Field(default=1, ge=0, le=1)
    transition_ms: int = Field(default=700, ge=0)


class ExpressionRequest(ExpressionMessage):
    payload: ExpressionRequestPayload
