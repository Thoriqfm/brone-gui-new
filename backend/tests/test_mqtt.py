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
        self.on_subscribe(self, None, 1, [OK, OK], None)

    def subscribe(self, topics):
        self.subscriptions.extend(topics)
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
    ingress._on_subscribe(ingress.client, None, 2, [OK, OK], None)
    assert ingress.client.address == ('localhost', 1883)
    assert ingress.client.subscriptions == [('robot/expression', 1), ('robot/voice_stage', 1)] * 2


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
    assert 'MQTT command rejected: invalid expression/stage JSON' in caplog.text
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


@pytest.mark.parametrize(('expression', 'emotion'), [
    ('idle', 'idle'), ('neutral', 'idle'), ('happy', 'happy'), ('excited', 'happier'),
    ('sad', 'sad'), ('confused', 'thinking'), ('cry', 'cry'), ('shock', 'shock'),
    ('thinking', 'thinking'), ('timeout', 'timeout'), ('happier', 'happier'),
])
def test_talk_mapping_and_websocket(mqtt_client, expression, emotion):
    client, ingress = mqtt_client
    with client.websocket_connect('/ws/face') as ws:
        ws.receive_json()
        deliver(ingress, json.dumps({'expression': expression}).encode())
        message = ws.receive_json()
        assert message['request_id'].startswith('talk-')
        assert message['type'] == 'SET_EXPRESSION'
        assert message['payload'] == {'emotion': emotion, 'intensity': 1, 'transition_ms': 700}


@pytest.mark.parametrize('payload', [
    b'{"expression":"unknown"}', b'{"expression":"happy","extra":1}',
    b'{"expression":"happy","duration":-1}', b'{"expression":"happy","duration":true}',
    b'{"expression":"happy","duration":"4"}', b'{"expression":"happy","duration":null}',
    b'{"expression":"happy","duration":NaN}', b'{"expression":"happy","duration":Infinity}',
])
def test_bad_talk_does_not_change_answer_or_state(mqtt_client, payload):
    client, ingress = mqtt_client
    deliver(ingress, b'{"expression":"sad"}')
    drain(client, ingress)
    before = client.get('/api/face/state').json()
    deliver(ingress, payload)
    drain(client, ingress)
    assert client.get('/api/face/state').json() == before
    assert ingress.adapter.last_answer == 'sad'


def test_stages_speaking_and_confused_answer(mqtt_client):
    client, ingress = mqtt_client
    def send(payload, stage=False):
        deliver(ingress, json.dumps(payload).encode(),
                topic=ingress.settings.stage_topic if stage else None)
        drain(client, ingress)
        return client.get('/api/face/state').json()['payload']['emotion']

    assert send({'stage': 'llm', 'state': 'start', 'ts': 1.5, 'detail': 'metadata'}, True) == 'thinking'
    assert send({'expression': 'speaking'}) == 'idle'
    assert send({'expression': 'happy'}) == 'happy'
    assert send({'stage': 'llm', 'state': 'start'}, True) == 'thinking'
    assert send({'expression': 'speaking'}) == 'happy'
    assert send({'expression': 'confused'}) == 'thinking'
    assert send({'expression': 'speaking'}) == 'thinking'
    assert send({'stage': 'error', 'state': 'llm'}, True) == 'timeout'
    before = client.get('/api/face/state').json()
    send({'stage': 'tts', 'state': 'start'}, True)
    assert client.get('/api/face/state').json() == before
    for raw in (b'{}', b'{"stage":4,"state":"start"}', b'{bad'):
        deliver(ingress, raw, topic=ingress.settings.stage_topic)
        drain(client, ingress)
        assert client.get('/api/face/state').json() == before


def test_duration_expires_broadcasts_idle_and_reconnects(mqtt_client):
    import asyncio
    client, ingress = mqtt_client
    deliver(ingress, b'{"expression":"happy"}')
    drain(client, ingress)
    with client.websocket_connect('/ws/face') as ws:
        ws.receive_json()
        deliver(ingress, b'{"expression":"speaking","duration":0.03}')
        assert ws.receive_json()['payload']['emotion'] == 'happy'
        idle = ws.receive_json()
        assert idle['payload'] == {'emotion': 'idle', 'intensity': 1, 'transition_ms': 700}
    with client.websocket_connect('/ws/face') as ws:
        assert ws.receive_json() == idle
    # Explicit zero expires immediately; omitted duration holds indefinitely.
    deliver(ingress, b'{"expression":"sad","duration":0}')
    drain(client, ingress)
    client.portal.call(asyncio.sleep, 0.02)
    assert client.get('/api/face/state').json()['payload']['emotion'] == 'idle'


@pytest.mark.parametrize('replacement', ['http', 'canonical', 'talk', 'stage'])
def test_new_commands_cancel_old_timer(mqtt_client, replacement):
    import asyncio
    client, ingress = mqtt_client
    deliver(ingress, b'{"expression":"happy","duration":60}')
    drain(client, ingress)
    old_task = app.state.face_commands.reset_task
    if replacement == 'http':
        assert client.post('/api/face/expression', json=EXAMPLE).status_code == 200
    elif replacement == 'canonical':
        deliver(ingress, json.dumps(EXAMPLE).encode())
    elif replacement == 'talk':
        deliver(ingress, b'{"expression":"sad"}')
    else:
        deliver(ingress, b'{"stage":"llm","state":"start"}', topic=ingress.settings.stage_topic)
    drain(client, ingress)
    client.portal.call(asyncio.sleep, 0)
    assert old_task.cancelled()
    assert app.state.face_commands.reset_task is None
    expected = client.get('/api/face/state').json()
    client.portal.call(asyncio.sleep, 0.02)
    assert client.get('/api/face/state').json() == expected


def test_ignored_stage_and_invalid_message_preserve_timer(mqtt_client):
    client, ingress = mqtt_client
    deliver(ingress, b'{"expression":"happy","duration":60}')
    drain(client, ingress)
    task = app.state.face_commands.reset_task
    deliver(ingress, b'{"stage":"tts","state":"start"}', topic=ingress.settings.stage_topic)
    deliver(ingress, b'{"expression":"bad"}')
    drain(client, ingress)
    assert app.state.face_commands.reset_task is task
    assert not task.done()
    # Shutdown must cancel a pending idle reset too.
    client.portal.call(app.state.face_commands.stop)
    assert task.cancelled()


def test_stage_topic_configuration_and_validation(monkeypatch):
    monkeypatch.setenv('BRONE_MQTT_STAGE_TOPIC', 'custom/stage')
    assert MqttSettings.from_env().stage_topic == 'custom/stage'
    with pytest.raises(ValidationError):
        MqttSettings(stage_topic='robot/#')


def test_partial_subscription_failure(mqtt_client):
    client, ingress = mqtt_client
    ingress._on_subscribe(ingress.client, None, 1, [OK, FAIL], None)
    assert not client.get('/health').json()['mqtt']['subscribed']


def test_new_timed_message_replaces_old_timer(mqtt_client):
    client, ingress = mqtt_client
    deliver(ingress, b'{"expression":"happy","duration":60}')
    drain(client, ingress)
    old_task = app.state.face_commands.reset_task
    with client.websocket_connect('/ws/face') as ws:
        ws.receive_json()
        deliver(ingress, b'{"expression":"sad","duration":0.03}')
        assert ws.receive_json()['payload']['emotion'] == 'sad'
        assert ws.receive_json()['payload']['emotion'] == 'idle'
    assert old_task.cancelled()


def test_duration_counts_from_receipt_and_stage_retained_is_ignored(mqtt_client, monkeypatch):
    client, ingress = mqtt_client
    deliver(ingress, b'{"stage":"llm","state":"start"}',
            topic=ingress.settings.stage_topic, retain=True)
    drain(client, ingress)
    assert client.get('/api/face/state').json()['request_id'] == 'initial'
    # Simulate an ingress timestamp already older than the duration.
    from time import monotonic
    times = iter((monotonic() - 10, monotonic()))
    monkeypatch.setattr(mqtt_ingress, 'monotonic', lambda: next(times))
    deliver(ingress, b'{"expression":"happy","duration":1}')
    drain(client, ingress)
    import asyncio
    client.portal.call(asyncio.sleep, 0.02)
    assert client.get('/api/face/state').json()['payload']['emotion'] == 'idle'
