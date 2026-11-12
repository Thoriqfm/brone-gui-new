# ARCHITECTURE

React/TypeScript frontend and Python FastAPI backend communicate through WebSocket. Emotion and viseme controllers will be separate.

Command producers can use HTTP or MQTT (enabled by default): producer -> Mosquitto -> backend MQTT subscriber -> shared FaceCommands state/broadcast -> WebSocket -> React renderer. MQTT never connects directly to React. The two ingress paths share validation, defaults and one in-memory state. See [MQTT](MQTT.md) for configuration and delivery limits.

MQTT also accepts brone-talk telemetry: `robot/expression` is translated by a backend adapter into canonical SET_EXPRESSION commands; `robot/voice_stage` selects thinking/timeout. FaceCommands owns the optional duration-to-idle task so every accepted HTTP or MQTT expression cancels the previous timer. Frontend rendering and the WebSocket schema are unchanged. No audio or viseme playback is introduced.
