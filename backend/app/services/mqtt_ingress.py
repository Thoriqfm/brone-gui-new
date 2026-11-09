"""MQTT command ingress; all state/broadcasts stay on FastAPI's event loop."""
import asyncio
from contextlib import suppress
import logging
import os
from threading import BoundedSemaphore

import paho.mqtt.client as mqtt
from pydantic import BaseModel, Field, SecretStr, ValidationError, field_validator

from app.schemas.messages import ExpressionMessage, ExpressionRequest
from app.services.face_command import FaceCommands

logger = logging.getLogger(__name__)


class MqttSettings(BaseModel):
    enabled: bool = True
    host: str = Field(default='localhost', min_length=1)
    port: int = Field(default=1883, ge=1, le=65535)
    topic: str = 'robot/expression'
    username: str | None = None
    password: SecretStr | None = None
    tls: bool = False
    ca_file: str | None = None

    @field_validator('topic')
    @classmethod
    def exact_topic(cls, value):
        if not value or any(char in value for char in ('+', '#', '\x00')) or len(value.encode('utf-8')) > 65535:
            raise ValueError('MQTT topic must be a nonempty exact topic without wildcards')
        return value

    @classmethod
    def from_env(cls):
        values = {name: os.environ[f'BRONE_MQTT_{name.upper()}']
                  for name in cls.model_fields
                  if f'BRONE_MQTT_{name.upper()}' in os.environ}
        # Keep HOST as a legacy alias; the public BROKER setting takes precedence.
        if 'BRONE_MQTT_BROKER' in os.environ:
            values['host'] = os.environ['BRONE_MQTT_BROKER']
        return cls.model_validate(values)


class MqttIngress:
    def __init__(self, settings: MqttSettings, commands: FaceCommands):
        self.settings, self.commands = settings, commands
        self.connected = False
        self.subscribed = False
        self.stopping = False
        self.queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=64)
        # Bound pending cross-thread callbacks as well as the asyncio queue.
        self.slots = BoundedSemaphore(64)
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, clean_session=True)
        if settings.username:
            self.client.username_pw_set(settings.username,
                settings.password.get_secret_value() if settings.password else None)
        if settings.tls:
            self.client.tls_set(ca_certs=settings.ca_file)
        elif settings.ca_file:
            raise ValueError('BRONE_MQTT_CA_FILE requires BRONE_MQTT_TLS=true')
        self.client.reconnect_delay_set(min_delay=1, max_delay=30)
        self.client.on_connect = self._on_connect
        self.client.on_subscribe = self._on_subscribe
        self.client.on_disconnect = self._on_disconnect
        self.client.on_connect_fail = self._on_connect_fail
        self.client.on_message = self._on_message

    def _on_connect(self, client, userdata, flags, reason_code, properties):
        self.connected = not reason_code.is_failure
        self.subscribed = False
        if reason_code.is_failure:
            logger.warning('MQTT connection rejected: %s', reason_code)
            return
        result, _ = client.subscribe(self.settings.topic, qos=1)
        if result != mqtt.MQTT_ERR_SUCCESS:
            logger.error('MQTT subscription could not be sent: %s', result)

    def _on_subscribe(self, client, userdata, mid, reason_codes, properties):
        self.subscribed = bool(reason_codes) and all(not code.is_failure for code in reason_codes)
        if self.subscribed:
            logger.info('MQTT subscribed topic=%s', self.settings.topic)
        else:
            logger.error('MQTT subscription rejected')

    def _on_disconnect(self, client, userdata, flags, reason_code, properties):
        self.connected = self.subscribed = False
        if not self.stopping:
            logger.warning('MQTT disconnected; reconnecting: %s', reason_code)

    def _on_connect_fail(self, client, userdata):
        logger.warning('MQTT broker %s:%s unavailable; retrying',
                       self.settings.host, self.settings.port)

    def _on_message(self, client, userdata, message):
        if self.stopping or message.topic != self.settings.topic:
            return
        # Commands are transient. Never replay a stale retained command on reconnect.
        if message.retain or len(message.payload) > 16384:
            logger.warning('MQTT command rejected: retained or larger than 16 KiB')
            return
        if not self.slots.acquire(blocking=False):
            logger.warning('MQTT command rejected: ingress queue full')
            return
        self.loop.call_soon_threadsafe(self.queue.put_nowait, message.payload)

    async def _consume(self):
        while True:
            raw = await self.queue.get()
            try:
                try:
                    request = ExpressionRequest.model_validate_json(raw)
                except ValidationError as exc:
                    # Explain the failure without logging untrusted payload contents.
                    errors = [(error['loc'], error['type'])
                              for error in exc.errors(include_input=False)]
                    logger.warning('MQTT command rejected: invalid SET_EXPRESSION JSON: %s', errors)
                    continue
                command = ExpressionMessage.model_validate(request.model_dump())
                await self.commands.publish(command)
            finally:
                self.slots.release()
                self.queue.task_done()

    def start(self):
        self.loop = asyncio.get_running_loop()
        self.worker = asyncio.create_task(self._consume())
        self.client.connect_async(self.settings.host, self.settings.port, keepalive=30)
        self.client.loop_start()

    async def stop(self):
        self.stopping = True
        self.client.disconnect()
        # Joining Paho's network thread must not block FastAPI's event loop.
        await asyncio.to_thread(self.client.loop_stop)
        self.worker.cancel()
        with suppress(asyncio.CancelledError):
            await self.worker
        self.connected = self.subscribed = False
