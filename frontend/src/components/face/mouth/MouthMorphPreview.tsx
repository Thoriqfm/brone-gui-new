import { useEffect, useRef, useState } from "react";
import type { animate } from "animejs";
import { FACE_LAYER_LAYOUTS, FACE_LAYER_ORDER } from "../../../config/faceLayerLayouts";
import { interpolateMouthLayout, sampleIdleMouthTransition, MOUTH_TARGETS, MOUTH_LABELS, MOUTH_EXPRESSION_PRESETS, type MouthTarget } from "../../../geometry/mouth";
import ProceduralMouth from "./ProceduralMouth";

/** Frame updates stay in this development component, outside canonical face state. */
export default function MouthMorphPreview() {
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState("Loading animation");
    const [ready, setReady] = useState(false);
    const [targetExpression, setTargetExpression] = useState<MouthTarget>("happy");
    const label = MOUTH_LABELS[targetExpression];
    const driver = useRef<typeof animate | null>(null);
    const animation = useRef<ReturnType<typeof animate> | null>(null);
    const value = useRef({ progress: 0 });
    const generation = useRef(0);
    const cancel = () => {
        generation.current++;
        animation.current?.cancel();
        animation.current = null;
    };
    useEffect(() => {
        let stopped = false;
        void import("animejs").then(({ animate }) => {
            if (stopped) return;
            driver.current = animate;
            setReady(true);
            setStatus(value.current.progress === 0 ? "Idle" : "Paused");
        }).catch(() => { if (!stopped) setStatus("Animation failed to load"); });
        return () => { stopped = true; cancel(); driver.current = null; };
    }, []);
    const seek = (next: number) => {
        cancel();
        value.current.progress = next;
        setProgress(next);
        setStatus(next === 0 ? "Idle" : next === 1 ? label : "Paused");
    };
    const play = (target: 0 | 1) => {
        if (!driver.current) return;
        cancel();
        const token = generation.current;
        const current = value.current;
        if (current.progress === target) { seek(target); return; }
        setStatus(target === 1 ? "Playing Idle to " + label : "Playing " + label + " to Idle");
        animation.current = driver.current(current, {
            progress: target, duration: 1000, ease: "inOutSine", autoplay: false,
            onUpdate: () => { if (generation.current === token) setProgress(current.progress); },
            onComplete: () => {
                if (generation.current !== token) return;
                animation.current = null;
                current.progress = target;
                setProgress(target);
                setStatus(target === 1 ? label : "Idle");
            },
        });
        animation.current.play();
    };
    const geometry = sampleIdleMouthTransition(targetExpression, progress);
    const position = interpolateMouthLayout(FACE_LAYER_LAYOUTS.idle.mouth, MOUTH_EXPRESSION_PRESETS[targetExpression].layout, progress);
    return <section className="mouth-morph-preview" aria-label="Mouth geometry morph preview">
        <h2>{"Idle to " + label + " geometry morph"}</h2>
        <label>Target expression: <select value={targetExpression} onChange={(event) => {
            const next = event.target.value as MouthTarget;
            if (!MOUTH_TARGETS.includes(next)) return;
            seek(0);
            setTargetExpression(next);
        }}>{MOUTH_TARGETS.map((name) => <option key={name} value={name}>{MOUTH_LABELS[name]}</option>)}</select></label>
        <p>{"Current expression: " + (progress === 0 ? "Idle" : progress === 1 ? label : "Idle → " + label) + "; target: " + label}</p>
        <div className="buttons">
            <button type="button" disabled={!ready || progress === 1} onClick={() => play(1)}>{"Play Idle → " + label}</button>
            <button type="button" onClick={() => seek(0)}>Reset to Idle</button>
            <button type="button" disabled={!ready || progress === 0} onClick={() => play(0)}>{"Reverse " + label + " → Idle"}</button>
        </div>
        <label>Morph progress: <input type="range" min="0" max="1" step="0.001" value={progress}
            onChange={(event) => seek(Number(event.target.value))} /></label>
        <output> {progress.toFixed(3)}</output>
        <p role="status">{status}</p>
        <figure><figcaption>Animated mouth — Play and Reverse control this preview</figcaption>
            <div className="face-canvas"><div className="face-artwork">
                <div className="face-layer procedural-mouth" data-mouth-morph="true" style={{
                    left: position.x / 800 * 100 + "%", top: position.y / 480 * 100 + "%",
                    width: position.width / 800 * 100 + "%", height: position.height / 480 * 100 + "%",
                    zIndex: FACE_LAYER_ORDER.mouth,
                }}><ProceduralMouth geometry={geometry} /></div>
            </div></div>
        </figure>
    </section>;
}
