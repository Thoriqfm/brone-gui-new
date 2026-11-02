import { useLayoutEffect, useRef } from "react";
import { createAnimationEngine, loadAnimeDriver, type AnimationEngine } from "./animationEngine";

export function useAnimationEngine(onReady?: (engine: AnimationEngine) => void | (() => void)) {
    const onReadyRef = useRef(onReady);
    onReadyRef.current = onReady;
    const rootRef = useRef<HTMLDivElement>(null);
    const engineRef = useRef<AnimationEngine | null>(null);
    useLayoutEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        let stopped = false;
        let engine: AnimationEngine | null = null;
        let releaseConsumer: void | (() => void);
        void loadAnimeDriver().then((driver) => {
            if (stopped || rootRef.current !== root || !root.isConnected) return;
            engine = createAnimationEngine(driver);
            engine.registerTarget("face-root", root);
            engineRef.current = engine;
            releaseConsumer = onReadyRef.current?.(engine);
        }).catch((error: unknown) => {
            if (!stopped) console.error("Animation engine initialization failed", error);
        });
        return () => {
            if (stopped) return;
            stopped = true;
            if (engineRef.current === engine) engineRef.current = null;
            try { releaseConsumer?.(); } finally { engine?.dispose(); }
        };
    }, []);
    // Null until the mount-owned Anime.js load completes; no React state updates.
    return { rootRef, engineRef };
}
