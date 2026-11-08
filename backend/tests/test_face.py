import copy
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from app.main import app

ROOT = Path(__file__).resolve().parents[2]
EXAMPLE = json.loads((ROOT / 'shared/examples/expression.json').read_text())
EMOTIONS = json.loads((ROOT / 'shared/face-protocol.schema.json').read_text())['properties']['payload']['properties']['emotion']['enum']


def test_publish_broadcast_reconnect_and_offline_state():
    with TestClient(app) as client:
        assert client.get('/api/face/state').json()['payload']['emotion'] == 'idle'
        with client.websocket_connect('/ws/face') as first, client.websocket_connect('/ws/face') as second:
            assert first.receive_json()['request_id'] == 'initial'
            assert second.receive_json()['request_id'] == 'initial'
            for emotion in EMOTIONS:
                message = copy.deepcopy(EXAMPLE)
                message['request_id'] = f'test-{emotion}'
                message['payload']['emotion'] = emotion
                response = client.post('/api/face/expression', json=message)
                assert response.status_code == 200
                assert response.json() == {'status': 'accepted', 'request_id': message['request_id'], 'connected_clients': 2}
                assert first.receive_json() == message
                assert second.receive_json() == message
                assert client.get('/api/face/state').json() == message
        # No display connected: state must still be retained for the next connection.
        assert client.post('/api/face/expression', json=EXAMPLE).status_code == 200
        with client.websocket_connect('/ws/face') as reconnected:
            assert reconnected.receive_json() == EXAMPLE


@pytest.mark.parametrize(('field', 'value'), [
    ('emotion', 'shy'), ('emotion', 'happier-transition'), ('emotion', 'unknown'),
    ('intensity', -0.1), ('intensity', 1.1), ('intensity', '0.7'), ('intensity', True),
    ('transition_ms', -1), ('transition_ms', 0.5), ('transition_ms', '300'),
    ('transition_ms', True), ('extra', 'unexpected'),
    ('intensity', None), ('transition_ms', None),
])
def test_invalid_payload_preserves_state(field, value):
    message = copy.deepcopy(EXAMPLE)
    message['payload'][field] = value
    with TestClient(app) as client:
        previous = client.get('/api/face/state').json()
        assert client.post('/api/face/expression', json=message).status_code == 422
        assert client.get('/api/face/state').json() == previous


def test_invalid_envelopes_and_origins():
    invalid = [dict(EXAMPLE, type='RESET_FACE'), dict(EXAMPLE, extra=True),
               dict(EXAMPLE, request_id=123), {'payload': EXAMPLE['payload']},
               dict(EXAMPLE, payload={'intensity': 0.7})]
    with TestClient(app) as client:
        for message in invalid:
            assert client.post('/api/face/expression', json=message).status_code == 422
        assert client.post('/api/face/expression', content='{bad', headers={'content-type': 'application/json'}).status_code == 422
        assert client.post('/api/face/expression', json=EXAMPLE, headers={'origin': 'https://example.com'}).status_code == 403
        assert client.get('/api/face/state').json()['request_id'] == 'initial'
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect('/ws/face', headers={'origin': 'https://example.com'}):
                pass
        with client.websocket_connect('/ws/face', headers={'origin': 'http://127.0.0.1:5173'}) as ws:
            ws.receive_json()
            ws.send_json(EXAMPLE)
            with pytest.raises(WebSocketDisconnect):
                ws.receive_json()


@pytest.mark.parametrize('origin', [
    'http://localhost:5173', 'http://127.0.0.1:5173',
    'http://localhost:8000', 'http://127.0.0.1:8000',
])
def test_local_frontend_and_swagger_origins(origin):
    with TestClient(app) as client:
        response = client.post('/api/face/expression', json=EXAMPLE, headers={'origin': origin})
        assert response.status_code == 200
        assert response.headers['access-control-allow-origin'] == origin
        assert client.get('/api/face/state').json() == EXAMPLE


def test_failed_display_does_not_reject_command(monkeypatch):
    async def disconnected_send(_message):
        raise WebSocketDisconnect(code=1006)

    with TestClient(app) as client:
        with client.websocket_connect('/ws/face') as ws:
            ws.receive_json()
            connection = next(iter(app.state.face_commands.clients))
            monkeypatch.setattr(connection, 'send_text', disconnected_send)
            response = client.post('/api/face/expression', json=EXAMPLE)
            assert response.status_code == 200
            assert response.json()['connected_clients'] == 0
            assert client.get('/api/face/state').json() == EXAMPLE


@pytest.mark.parametrize(('overrides', 'intensity', 'transition_ms'), [
    ({}, 1, 700),
    ({'intensity': 0.3}, 0.3, 700),
    ({'transition_ms': 1200}, 1, 1200),
    ({'intensity': 0, 'transition_ms': 0}, 0, 0),
    ({'intensity': 1, 'transition_ms': 700}, 1, 700),
])
def test_http_defaults_normalized_for_websocket_and_reconnect(overrides, intensity, transition_ms):
    from app.schemas.messages import ExpressionMessage
    from pydantic import ValidationError

    message = json.loads((ROOT / 'shared/examples/expression-request.json').read_text())
    # This HTTP-only fixture must still be rejected by the canonical wire model.
    with pytest.raises(ValidationError):
        ExpressionMessage.model_validate(message)
    message['payload'].update(overrides)
    expected = copy.deepcopy(message)
    expected['payload'].update(intensity=intensity, transition_ms=transition_ms)
    with TestClient(app) as client:
        with client.websocket_connect('/ws/face') as ws:
            ws.receive_json()
            response = client.post('/api/face/expression', json=message)
            assert response.status_code == 200
            assert response.json()['status'] == 'accepted'
            received = ws.receive_json()
            assert received == expected
            assert ExpressionMessage.model_validate(received).model_dump() == expected
            assert client.get('/api/face/state').json() == expected
        with client.websocket_connect('/ws/face') as ws:
            assert ws.receive_json() == expected


def test_openapi_documents_http_defaults():
    with TestClient(app) as client:
        schemas = client.get('/openapi.json').json()['components']['schemas']
        request = schemas['ExpressionRequestPayload']
        assert request['required'] == ['emotion']
        assert request['properties']['intensity']['default'] == 1
        assert request['properties']['transition_ms']['default'] == 700
        assert set(schemas['ExpressionPayload']['required']) == {'emotion', 'intensity', 'transition_ms'}
