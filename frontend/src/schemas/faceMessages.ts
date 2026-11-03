export const EMOTIONS = [
    "idle",
    "happy",
    "happier",
    "sad",
    "cry",
    "shock",
    "thinking",
    "timeout",
] as const;
export type Emotion = (typeof EMOTIONS)[number];
export type FaceMessage =
    | {
          type: "SET_EXPRESSION";
          request_id: string;
          payload: {
              emotion: Emotion;
              intensity: number;
              transition_ms: number;
          };
      }
    | {
          type: "RESET_FACE";
          request_id: string;
          payload: { transition_ms: number };
      };
export function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function isEmotion(value: unknown): value is Emotion {
    return typeof value === "string" && EMOTIONS.includes(value as Emotion);
}
export function isIntensity(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
export function isTransitionMs(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}
function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
    return Object.keys(value).length === keys.length &&
        keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

export function parseFaceMessage(value: unknown): FaceMessage | null {
    if (!isRecord(value) || typeof value.request_id !== "string" || !isRecord(value.payload)) return null;
    const p = value.payload;
    // Frontend-only legacy compatibility, NOT shared v0.1. Its numeric duration
    // was historically ignored; the transport maps reset to an immediate idle request.
    if (value.type === "RESET_FACE" && typeof p.transition_ms === "number") {
        return { type: "RESET_FACE", request_id: value.request_id, payload: { transition_ms: p.transition_ms } };
    }
    if (value.type !== "SET_EXPRESSION" ||
        !hasExactKeys(value, ["type", "request_id", "payload"]) ||
        !hasExactKeys(p, ["emotion", "intensity", "transition_ms"]) ||
        !isEmotion(p.emotion) || !isIntensity(p.intensity) || !isTransitionMs(p.transition_ms)) return null;
    return {
        type: "SET_EXPRESSION",
        request_id: value.request_id,
        payload: { emotion: p.emotion, intensity: p.intensity, transition_ms: p.transition_ms },
    };
}
