import copy
import json
from pathlib import Path
from threading import Thread
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.services import mqtt_ingress
from app.services.mqtt_ingress import MqttSettings

EXAMPLE = json.loads((Path(__file__).resolve().parents[2] / 'shared/examples/expression.json').read_text())
OK = SimpleNamespace(is_failure=False)
FAIL = SimpleNamespace(is_failure=True)


class FakeClient:
    def __init__(self, *args, **kwargs):
        self.subscriptions = []
        self.stopped = False

    def reconnect_delay_set(self, **kwargs):
        self.delays = kwargs

    def connect_async(self, host, port, **kwargs):
        self.address = (host, port)

    def loop_start(self):
        self.on_connect(self, None, None, OK, None)
        self.on_subscribe(self, None, 1, [OK], None)

    def subscribe(self, topic, qos):
        self.subscriptions.append((topic, qos))
        return 0, 1

    def disconnect(self):
        self.on_disconnect(self, None, None, OK, None)

    def loop_stop(self):
        self.stopped = True


@pytest.fixture
def mqtt_client(monkeypatch):
    monkeypatch.setenv('BRONE_MQTT_ENABLED', 'true')
    monkeypatch.setattr(mqtt_ingress.mqtt, 'Client', FakeClient)
    with TestClient(app) as client:
        yield client, app.state.mqtt
    assert app.state.mqtt.client.stopped
    assert app.state.mqtt.worker.cancelled()


def deliver(ingress, payload, *, retain=False, topic=None):
    # Exercise the same thread boundary as Paho's real network callbacks.
    thread = Thread(target=ingress._on_message, args=(None, None, SimpleNamespace(
        payload=payload, retain=retain, topic=topic or ingress.settings.topic)))
    thread.start()
    thread.join()


def drain(client, ingress):
    client.portal.call(ingress.queue.join)


def test_mqtt_defaults_broadcast_reconnect_and_http_compatibility(mqtt_client):
    client, ingress = mqtt_client
    assert client.get('/health').json()['mqtt'] == {
        'enabled': True, 'connected': True, 'subscribed': True}
    with client.websocket_connect('/ws/face') as ws:
        assert ws.receive_json()['request_id'] == 'initial'
        message = {'type': 'SET_EXPRESSION', 'request_id': 'mqtt-1', 'payload': {'emotion': 'happy'}}
        deliver(ingress, json.dumps(message).encode())
        expected = copy.deepcopy(message)
        expected['payload'].update(intensity=1, transition_ms=700)
        assert ws.receive_json() == expected
        assert client.get('/api/face/state').json() == expected
        # HTTP and MQTT share the same state and broadcast path.
        assert client.post('/api/face/expression', json=EXAMPLE).status_code == 200
        assert ws.receive_json() == EXAMPLE
    with client.websocket_connect('/ws/face') as ws:
        assert ws.receive_json() == EXAMPLE
    ingress._on_disconnect(ingress.client, None, None, FAIL, None)
    assert not client.get('/health').json()['mqtt']['connected']
    ingress._on_connect(ingress.client, None, None, OK, None)
    ingress._on_subscribe(ingress.client, None, 2, [OK], None)
    assert ingress.client.address == ('localhost', 1883)
    assert ingress.client.subscriptions == [('robot/expression', 1)] * 2


@pytest.mark.parametrize('payload', [
    b'{bad', b'\xff', b'null', b'[]',
    b'{"type":"RESET_FACE","request_id":"bad","payload":{"emotion":"idle"}}',
    b'{"type":"SET_EXPRESSION","request_id":"bad","payload":{"emotion":"shy"}}',
    b'{"type":"SET_EXPRESSION","request_id":"bad","payload":{"emotion":"happy","intensity":true}}',
    b'{"type":"SET_EXPRESSION","request_id":"bad","payload":{"emotion":"happy","transition_ms":-1}}',
    b'{"type":"SET_EXPRESSION","request_id":"bad","payload":{"emotion":"happy","extra":1}}',
])
def test_invalid_mqtt_preserves_state(mqtt_client, payload, caplog):
    client, ingress = mqtt_client
    before = client.get('/api/face/state').json()
    deliver(ingress, payload)
    drain(client, ingress)
    assert client.get('/api/face/state').json() == before
    assert 'MQTT command rejected: invalid SET_EXPRESSION JSON:' in caplog.text
    # Consumer must survive malformed input and accept the next valid command.
    deliver(ingress, json.dumps(EXAMPLE).encode())
    drain(client, ingress)
    assert client.get('/api/face/state').json() == EXAMPLE


def test_retained_wrong_topic_large_and_stopped_messages_ignored(mqtt_client):
    client, ingress = mqtt_client
    raw = json.dumps(EXAMPLE).encode()
    deliver(ingress, raw, retain=True)
    deliver(ingress, raw, topic='other/topic')
    deliver(ingress, b' ' * 16385)
    ingress.stopping = True
    deliver(ingress, raw)
    drain(client, ingress)
    assert client.get('/api/face/state').json()['request_id'] == 'initial'


def test_ordered_messages_and_bounded_backlog(mqtt_client):
    client, ingress = mqtt_client
    for index in range(8):
        deliver(ingress, json.dumps(dict(EXAMPLE, request_id=f'mqtt-{index}')).encode())
    drain(client, ingress)
    assert client.get('/api/face/state').json()['request_id'] == 'mqtt-7'
    for _ in range(64):
        assert ingress.slots.acquire(blocking=False)
    deliver(ingress, json.dumps(EXAMPLE).encode())
    drain(client, ingress)
    assert client.get('/api/face/state').json()['request_id'] == 'mqtt-7'
    for _ in range(64):
        ingress.slots.release()


def test_subscription_and_connection_failures_are_visible(mqtt_client):
    client, ingress = mqtt_client
    ingress._on_subscribe(ingress.client, None, 1, [FAIL], None)
    assert not client.get('/health').json()['mqtt']['subscribed']
    ingress._on_connect(ingress.client, None, None, FAIL, None)
    assert not client.get('/health').json()['mqtt']['connected']


@pytest.mark.parametrize('overrides', [
    {'port': 0}, {'port': 65536}, {'topic': ''}, {'topic': 'brone/#'},
    {'topic': 'brone/+'}, {'topic': '\x00'}, {'enabled': 'maybe'},
])
def test_invalid_settings(overrides):
    with pytest.raises(ValidationError):
        MqttSettings(**overrides)


def test_environment_configuration(monkeypatch):
    monkeypatch.setenv('BRONE_MQTT_ENABLED', 'true')
    monkeypatch.setenv('BRONE_MQTT_BROKER', 'broker.local')
    monkeypatch.setenv('BRONE_MQTT_PORT', '1884')
    monkeypatch.setenv('BRONE_MQTT_TOPIC', 'robot/brone/expression')
    settings = MqttSettings.from_env()
    assert settings.enabled and settings.host == 'broker.local'
    assert settings.port == 1884 and settings.topic == 'robot/brone/expression'


def test_defaults_and_legacy_host_precedence(monkeypatch):
    for name in ('ENABLED', 'BROKER', 'HOST', 'PORT', 'TOPIC'):
        monkeypatch.delenv(f'BRONE_MQTT_{name}', raising=False)
    settings = MqttSettings.from_env()
    assert settings.enabled
    assert (settings.host, settings.port, settings.topic) == ('localhost', 1883, 'robot/expression')
    monkeypatch.setenv('BRONE_MQTT_HOST', 'legacy.local')
    assert MqttSettings.from_env().host == 'legacy.local'
    monkeypatch.setenv('BRONE_MQTT_BROKER', 'nuc.local')
    assert MqttSettings.from_env().host == 'nuc.local'


def test_mqtt_can_be_disabled(monkeypatch):
    monkeypatch.setenv('BRONE_MQTT_ENABLED', 'false')
    with TestClient(app) as client:
        assert app.state.mqtt is None
        assert client.get('/health').json()['mqtt']['enabled'] is False
        assert client.post('/api/face/expression', json=EXAMPLE).status_code == 200


def test_all_schema_emotions_accepted(mqtt_client):
    client, ingress = mqtt_client
    schema = json.loads((Path(__file__).resolve().parents[2] / 'shared/face-protocol.schema.json').read_text())
    for emotion in schema['properties']['payload']['properties']['emotion']['enum']:
        message = {'type': 'SET_EXPRESSION', 'request_id': f'talk-{emotion}',
                   'payload': {'emotion': emotion}}
        deliver(ingress, json.dumps(message).encode())
        drain(client, ingress)
        assert client.get('/api/face/state').json()['payload'] == {
            'emotion': emotion, 'intensity': 1, 'transition_ms': 700}


def test_broker_unavailable_does_not_prevent_http_or_shutdown(monkeypatch):
    monkeypatch.setenv('BRONE_MQTT_ENABLED', 'true')
    # No server listens on this ephemeral port; exercise the real Paho lifecycle.
    import socket
    with socket.socket() as unavailable:
        unavailable.bind(('127.0.0.1', 0))
        monkeypatch.setenv('BRONE_MQTT_BROKER', '127.0.0.1')
        monkeypatch.setenv('BRONE_MQTT_PORT', str(unavailable.getsockname()[1]))
        with TestClient(app) as client:
            assert client.get('/health').json()['mqtt']['enabled']
            assert not client.get('/health').json()['mqtt']['connected']
            assert client.post('/api/face/expression', json=EXAMPLE).status_code == 200
