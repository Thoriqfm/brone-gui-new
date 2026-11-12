"""Translate brone-talk telemetry into the existing GUI expression protocol."""
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.messages import Emotion, ExpressionRequest, StrictModel


class TalkExpression(StrictModel):
    expression: Literal['idle', 'neutral', 'happy', 'excited', 'sad', 'confused',
                        'speaking', 'happier', 'cry', 'shock', 'thinking', 'timeout']
    duration: float = Field(default=0, ge=0)


class VoiceStage(BaseModel):
    # Stage telemetry also carries producer-specific timing/diagnostic metadata.
    model_config = ConfigDict(strict=True, extra='ignore')
    stage: str = Field(min_length=1)
    state: str = Field(min_length=1)


def expression_request(emotion: Emotion) -> ExpressionRequest:
    return ExpressionRequest(type='SET_EXPRESSION', request_id=f'talk-{uuid4().hex}',
                             payload={'emotion': emotion})


class TalkAdapter:
    def __init__(self):
        self.last_answer: Emotion = 'idle'

    def expression(self, raw: bytes):
        message = TalkExpression.model_validate_json(raw)
        if message.expression != 'speaking':
            self.last_answer = {'neutral': 'idle', 'excited': 'happier',
                                'confused': 'thinking'}.get(message.expression, message.expression)
        duration = message.duration if 'duration' in message.model_fields_set else None
        return expression_request(self.last_answer), duration

    def stage(self, raw: bytes):
        message = VoiceStage.model_validate_json(raw)
        emotion = {('llm', 'start'): 'thinking', ('error', 'llm'): 'timeout'}.get(
            (message.stage, message.state))
        return expression_request(emotion) if emotion else None
