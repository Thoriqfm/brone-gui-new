import { isEmotion, isIntensity, isRecord, isTransitionMs, type Emotion } from "../schemas/faceMessages";
import { useFaceStore } from "../stores/faceStore";

export type ExpressionRequestSource = "manual" | "websocket" | "reset";
export interface ExpressionRequest {
    emotion: Emotion;
    intensity: number;
    transitionMs: number;
    requestId?: string;
    source: ExpressionRequestSource;
}

export const MANUAL_TRANSITION_MS = 300;
export type ExpressionRequestResult = "accepted" | "duplicate" | "rejected";

// The only application entry point for semantic expression updates. No visual timing here.
export function requestExpression(value: unknown): ExpressionRequestResult {
    if (!isRecord(value) || !isEmotion(value.emotion) || !isIntensity(value.intensity) ||
        !isTransitionMs(value.transitionMs) ||
        (value.requestId !== undefined && typeof value.requestId !== "string") ||
        (value.source !== "manual" && value.source !== "websocket" && value.source !== "reset")) {
        return "rejected";
    }
    const request: ExpressionRequest = {
        emotion: value.emotion,
        intensity: value.intensity,
        transitionMs: value.transitionMs,
        requestId: value.requestId,
        source: value.source,
    };
    const current = useFaceStore.getState();
    if (current.emotion === request.emotion && current.intensity === request.intensity) {
        return "duplicate";
    }
    // Synchronous replacement: no queue, request-ID ordering, or animation restart.
    useFaceStore.setState(request);
    return "accepted";
}
