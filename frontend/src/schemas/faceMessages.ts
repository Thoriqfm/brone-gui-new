export const EMOTIONS = [
    "idle",
    "happy",
    "happier",
    "sad",
    "cry",
    "shock",
    "shy",
    "thinking",
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
export function parseFaceMessage(value: unknown): FaceMessage | null {
    if (!value || typeof value !== "object") return null;
    const v = value as Record<string, unknown>;
    if (
        typeof v.request_id !== "string" ||
        !v.payload ||
        typeof v.payload !== "object"
    )
        return null;
    const p = v.payload as Record<string, unknown>;
    if (v.type === "RESET_FACE" && typeof p.transition_ms === "number")
        return v as FaceMessage;
    if (
        v.type === "SET_EXPRESSION" &&
        EMOTIONS.includes(p.emotion as Emotion) &&
        typeof p.intensity === "number" &&
        p.intensity >= 0 &&
        p.intensity <= 1 &&
        typeof p.transition_ms === "number" &&
        p.transition_ms >= 0
    )
        return v as FaceMessage;
    return null;
}
