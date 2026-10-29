import { parseFaceMessage } from "../schemas/faceMessages";
import { useFaceStore } from "../stores/faceStore";
const url = import.meta.env.VITE_WS_URL || "ws://127.0.0.1:8000/ws/face";
let socket: WebSocket | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let stopped = false;
export function connectFaceSocket() {
    stopped = false;
    const connect = () => {
        if (stopped) return;
        socket = new WebSocket(url);
        socket.onopen = () => useFaceStore.getState().setConnected(true);
        socket.onmessage = (event) => {
            try {
                const message = parseFaceMessage(JSON.parse(event.data));
                if (!message) return;
                if (message.type === "SET_EXPRESSION")
                    useFaceStore
                        .getState()
                        .setEmotion(
                            message.payload.emotion,
                            message.payload.intensity,
                        );
                else useFaceStore.getState().setEmotion("idle", 0.5);
            } catch (e) {
                console.warn("Invalid face command", e);
            }
        };
        socket.onclose = () => {
            useFaceStore.getState().setConnected(false);
            if (!stopped) timer = setTimeout(connect, 1500);
        };
        socket.onerror = () => socket?.close();
    };
    connect();
    return () => {
        stopped = true;
        if (timer) clearTimeout(timer);
        socket?.close();
        socket = null;
        useFaceStore.getState().setConnected(false);
    };
}
