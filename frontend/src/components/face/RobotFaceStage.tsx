import { useEffect, useRef, useState } from "react";
import { startAutomaticBlink } from "../../animation/automaticBlink";
import { createBlinkChannel, createMorphBlinkPlayback } from "../../animation/morphBlinkPlayback";
import type { FaceRendererMode } from "../../animation/productionGeometry";
import { useAnimationEngine } from "../../animation/useAnimationEngine";
import FaceRenderer from "./FaceRenderer";

/** Own automatic blinking independently of the optional development previews. */
export default function RobotFaceStage({ renderer, active = true }: { renderer: FaceRendererMode; active?: boolean }) {
    const [channel] = useState(createBlinkChannel);
    const [playback, setPlayback] = useState<ReturnType<typeof createMorphBlinkPlayback> | null>(null);
    const morph = useRef<HTMLSpanElement>(null), blink = useRef<HTMLSpanElement>(null);
    const { rootRef } = useAnimationEngine(engine => {
        const current = createMorphBlinkPlayback(engine, morph.current!, blink.current!, () => {}, channel);
        setPlayback(current);
        return () => { current.seekBlink(0); current.dispose(); };
    });
    useEffect(() => {
        if (!playback) return;
        if (renderer !== "procedural" || !active) {
            playback.seekBlink(0);
            return;
        }
        const media = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
        let stop: (() => void) | undefined;
        const sync = () => {
            stop?.(); stop = undefined;
            if (document.hidden || media?.matches) playback.seekBlink(0);
            else stop = startAutomaticBlink(playback);
        };
        sync();
        document.addEventListener("visibilitychange", sync);
        media?.addEventListener("change", sync);
        return () => {
            stop?.();
            document.removeEventListener("visibilitychange", sync);
            media?.removeEventListener("change", sync);
            playback.seekBlink(0);
        };
    }, [playback, renderer, active]);
    return <div ref={rootRef} className="robot-stage">
        <span hidden ref={morph} data-progress="0" /><span hidden ref={blink} data-progress="0" />
        <FaceRenderer renderer={renderer} blinkChannel={renderer === "procedural" ? channel : undefined} />
    </div>;
}
