import { create } from "zustand";
import type { Emotion } from "../schemas/faceMessages";
import type { ExpressionRequestSource } from "../animation/expressionController";

interface Store {
    emotion: Emotion;
    intensity: number;
    transitionMs: number;
    requestId?: string;
    source: ExpressionRequestSource | null;
    connected: boolean;
    setConnected: (connected: boolean) => void;
}
export const useFaceStore = create<Store>((set) => ({
    emotion: "idle",
    intensity: 0.5,
    transitionMs: 0,
    requestId: undefined,
    source: null, // Initial state has no accepted request source.
    connected: false,
    setConnected: (connected) => set({ connected }),
}));
