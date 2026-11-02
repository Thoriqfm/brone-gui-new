import { parseFaceMessage } from "../schemas/faceMessages";
import type { ExpressionRequest } from "../animation/expressionController";
import { useFaceStore } from "../stores/faceStore";

const url = import.meta.env.VITE_WS_URL || "ws://127.0.0.1:8000/ws/face";
export function connectFaceSocket(onRequest: (request: ExpressionRequest) => void) {
    // Per-connection ownership prevents stale StrictMode/reconnect callbacks.
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const connect = () => {
        if (stopped) return;
        timer = null;
        const current = new WebSocket(url);
        socket = current;
        const isCurrent = () => !stopped && socket === current;
        current.onopen = () => {
            if (isCurrent()) useFaceStore.getState().setConnected(true);
        };
        current.onmessage = (event) => {
            if (!isCurrent()) return;
            try {
                const message = parseFaceMessage(JSON.parse(event.data));
                if (!message) return;
                if (message.type === "SET_EXPRESSION") {
                    onRequest({
                        emotion: message.payload.emotion,
                        intensity: message.payload.intensity,
                        transitionMs: message.payload.transition_ms,
                        requestId: message.request_id,
                        source: "websocket",
                    });
                } else {
                    // Preserve legacy reset's idle/0.5 behavior and ignored duration.
                    onRequest({ emotion: "idle", intensity: 0.5, transitionMs: 0,
                        requestId: message.request_id, source: "reset" });
                }
            } catch (e) {
                console.warn("Invalid face command", e);
            }
        };
        current.onclose = () => {
            if (!isCurrent()) return;
            socket = null;
            useFaceStore.getState().setConnected(false);
            timer = setTimeout(connect, 1500);
        };
        current.onerror = () => { if (isCurrent()) current.close(); };
    };
    connect();
    return () => {
        if (stopped) return;
        stopped = true;
        if (timer !== null) clearTimeout(timer);
        if (socket) {
            socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
            socket.close();
            socket = null;
        }
        useFaceStore.getState().setConnected(false);
    };
}
