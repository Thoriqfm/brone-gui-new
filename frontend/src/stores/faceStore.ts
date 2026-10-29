import { create } from "zustand";
import type { Emotion } from "../schemas/faceMessages";
interface Store {
    emotion: Emotion;
    intensity: number;
    connected: boolean;
    setEmotion: (emotion: Emotion, intensity: number) => void;
    setConnected: (connected: boolean) => void;
}
export const useFaceStore = create<Store>((set) => ({
    emotion: "idle",
    intensity: 0.5,
    connected: false,
    setEmotion: (emotion, intensity) => set({ emotion, intensity }),
    setConnected: (connected) => set({ connected }),
}));
