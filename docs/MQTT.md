# MQTT command delivery

Data path: command producer -> Mosquitto broker -> Python backend -> WebSocket -> face renderer.
The browser must remain open and connected to render the face. HTTP control remains available for compatibility/debugging; commands no longer need an HTTP POST with the default MQTT subscriber. Neither ROS2 nor a browser MQTT client is needed.

## Local Ubuntu setup

Install the broker and terminal client on the robot computer:

```bash
sudo apt update
sudo apt install mosquitto mosquitto-clients
sudo systemctl enable --now mosquitto
```

Use an existing broker if the OS team already runs one; do not launch a second broker on the same port. Defaults below assume local loopback access. Keep anonymous development access limited to loopback. Any network listener requires the OS team's authentication/ACL configuration and TLS as appropriate; do not expose port 1883 publicly.

Update backend dependencies from the repository root (existing virtualenv):

```bash
backend/.venv/bin/python -m pip install -e './backend[dev]'
```

Start Brone from the repository root (MQTT is enabled by default):

```bash
export BRONE_MQTT_ENABLED=true
export BRONE_MQTT_BROKER=localhost
export BRONE_MQTT_PORT=1883
export BRONE_MQTT_TOPIC=robot/expression
npm run dev
```

The launcher inherits these settings and enables the browser's local WebSocket. For deployment, pass the same variables to the backend service; the frontend should use a production build. Settings are read from the process environment, not automatically from a `.env` file. Stop previous Brone processes with Ctrl+C before starting.

Check subscription readiness in another SSH terminal:

```bash
curl -sS http://127.0.0.1:8000/health
```

Expected MQTT fields: `"enabled":true,"connected":true,"subscribed":true`. Backend health `status:ok` alone does not mean MQTT is ready. Wait for subscription before publishing transient commands.

Send a command without HTTP:

```bash
mosquitto_pub -h 127.0.0.1 -p 1883 -q 1 \
  -t robot/expression \
  -m '{"type":"SET_EXPRESSION","request_id":"mqtt-1","payload":{"emotion":"happy"}}'
```

Omitted intensity defaults to 1 and transition_ms to 700. Full form:

```bash
mosquitto_pub -h 127.0.0.1 -p 1883 -q 1 \
  -t robot/expression \
  -m '{"type":"SET_EXPRESSION","request_id":"mqtt-2","payload":{"emotion":"sad","intensity":1,"transition_ms":700}}'
```

Expressions: `idle`, `happy`, `happier`, `sad`, `cry`, `shock`, `thinking`, `timeout`. Intensity is validated and stored but does not yet change the artwork. Commands do not change the current 40 FPS Anime.js cap.

Verify backend acceptance using `GET /api/face/state` or the backend's `face_command accepted` log, then verify the visible face. Success from `mosquitto_pub -q 1` acknowledges broker receipt, not backend validation or display completion. There is no MQTT response/status topic in this slice.

## NUC to Jetson

Run the subscriber backend on Jetson; it continues to serve HTTP/WebSocket on port 8000. If Mosquitto also runs on Jetson, keep `BRONE_MQTT_BROKER=localhost` there. The NUC publisher connects to the Jetson broker address, using the broker team's authenticated listener/ACL configuration:

```bash
mosquitto_pub -h <jetson-broker-address> -p 1883 -q 1 \
  -t robot/expression \
  -m '{"type":"SET_EXPRESSION","request_id":"talk-001","payload":{"emotion":"happy"}}'
```

Add the agreed broker credentials/TLS options to the publisher command. If Mosquitto runs on the NUC instead, set `BRONE_MQTT_BROKER` on Jetson to the NUC broker address. Broker port 1883 and backend port 8000 are separate. Speaking/visemes are not implemented.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `BRONE_MQTT_ENABLED` | `true` | Enable the subscriber |
| `BRONE_MQTT_BROKER` | `localhost` | Broker hostname; takes precedence over legacy `BRONE_MQTT_HOST` |
| `BRONE_MQTT_PORT` | `1883` | Broker TCP port |
| `BRONE_MQTT_TOPIC` | `robot/expression` | One exact topic, no `+`/`#` wildcards |
| `BRONE_MQTT_USERNAME` | unset | Optional broker username |
| `BRONE_MQTT_PASSWORD` | unset | Optional broker password; keep out of Git/logs |
| `BRONE_MQTT_TLS` | `false` | Enable TLS with certificate verification |
| `BRONE_MQTT_CA_FILE` | unset | Optional private CA certificate file, requires TLS |

Set port 8883 explicitly if your broker uses it for TLS; enabling TLS does not change the port automatically. A username/password does not encrypt a connection. Use the broker team's agreed topic and credentials once available. TLS uses system CAs unless a CA file is specified. Broker ACLs should restrict who may publish face commands.

## Windows development

Install/run a local Mosquitto broker separately, or connect to the agreed broker. Update dependencies, then configure MQTT in the same PowerShell terminal as the launcher:

```powershell
.\backend\.venv\Scripts\python.exe -m pip install -e './backend[dev]'
$env:BRONE_MQTT_ENABLED = 'true'
$env:BRONE_MQTT_BROKER = 'localhost'
$env:BRONE_MQTT_PORT = '1883'
$env:BRONE_MQTT_TOPIC = 'robot/expression'
npm.cmd run dev
```

To avoid PowerShell native JSON quoting differences, publish the existing fixture via file (in another terminal at repository root):

```powershell
mosquitto_pub -h 127.0.0.1 -p 1883 -q 1 -t robot/expression -f shared/examples/expression.json
```

If `mosquitto_pub` is not on PATH, use its full executable path.

## Delivery and rollback

- Runtime validation rejects invalid JSON, unsupported commands/emotions, unknown fields and invalid numeric values. No executable input is accepted.
- Subscription is QoS 1; producer QoS determines effective delivery. Reconnect subscribes again with a clean session. Commands sent while disconnected may be lost; no durable offline queue exists.
- Do not use `mosquitto_pub -r`: commands are transient. Retained messages replayed at subscribe time are ignored. MQTT can forward a retained publish to an already-connected subscriber as a live message; this is not an end-to-end ban on the publisher's retain flag.
- Duplicate delivery is possible. `SET_EXPRESSION` replaces absolute state; identical current emotion/intensity does not restart the frontend animation. Request IDs are correlation only, not ordering/deduplication keys. Mixed HTTP/MQTT producers share arrival-order state; avoid competing controllers.
- At most 64 MQTT commands are queued/in flight locally; overload drops new commands and logs a warning. Payload limit is 16 KiB. This is a local interactive command channel, not a durable job queue.
- Broker outages leave the current face state intact; HTTP and display reconnect remain usable. Paho retries with 1–30 second backoff. No automatic `timeout` expression is sent.
- Backend state resets to idle on restart, remains single-process, and must not use multiple Uvicorn workers.
- To roll back to HTTP-only operation, set `BRONE_MQTT_ENABLED=false`, then restart Brone. No data migration or frontend rebuild is needed.

## Verification

```bash
backend/.venv/bin/python -m pytest backend/tests
```

Tests cover MQTT callback-to-state/WebSocket delivery with a simulated Paho client, normalization, invalid/retained/oversized messages, bounded backlog, resubscription, shutdown and HTTP compatibility. A real Paho connection to an unavailable local port verifies nonblocking startup/shutdown. These are not a live Mosquitto or visual acceptance test; run the publish/health/state steps above against the actual broker too.

References: [Paho client API](https://eclipse.dev/paho/files/paho.mqtt.python/html/client.html), [Mosquitto broker](https://mosquitto.org/man/mosquitto-8.html), [mosquitto_pub](https://mosquitto.org/man/mosquitto_pub-1.html).
