import { useEffect, useRef, useState } from "react";
import type { animate } from "animejs";
import { FACE_LAYER_LAYOUTS, FACE_LAYER_ORDER } from "../../../config/faceLayerLayouts";
import { EYE_EXPRESSION_PRESETS, eyeProgress, interpolateEyeGeometry, interpolateEyeLayout } from "../../../geometry/eyes";
import ProceduralEye from "./ProceduralEye";

type Source = "idle" | "sad";
type Target = "happier" | "sad" | "cry" | "thinking";
const expressionLabel = (value: string) => value[0].toUpperCase() + value.slice(1);
/** Owns only its local progress animation; no production controller or store writes. */
export default function EyeMorphPreview() {
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState("Loading animation");
    const [ready, setReady] = useState(false);
    const [targetExpression, setTargetExpression] = useState<Target>("happier");
    const [sourceExpression, setSourceExpression] = useState<Source>("idle");
    const label = expressionLabel(targetExpression), sourceLabel = expressionLabel(sourceExpression);
    const driver = useRef<typeof animate | null>(null);
    const animation = useRef<ReturnType<typeof animate> | null>(null);
    const value = useRef({ progress: 0 });
    const generation = useRef(0);
    const selectedTarget = useRef<Target>("happier");
    const selectedSource = useRef<Source>("idle");
    const cancel = () => {
        generation.current++;
        // Detach the old Anime.js target as well as ignoring its callbacks.
        value.current = { progress: value.current.progress };
        animation.current?.cancel();
        animation.current = null;
    };
    useEffect(() => {
        let stopped = false;
        void import("animejs").then(({ animate }) => {
            if (stopped) return;
            driver.current = animate;
            setReady(true);
            setStatus(value.current.progress === 0 ? expressionLabel(selectedSource.current) : value.current.progress === 1 ?
                expressionLabel(selectedTarget.current) : "Paused");
        }).catch(() => { if (!stopped) setStatus("Animation failed to load"); });
        return () => { stopped = true; cancel(); driver.current = null; };
    }, []);
    const seek = (next: number) => {
        if (!Number.isFinite(next)) return;
        const p = eyeProgress(next);
        cancel(); value.current.progress = p;
        setProgress(p); setStatus(p === 0 ? sourceLabel : p === 1 ? label : "Paused");
    };
    const play = (target: 0 | 1) => {
        if (!driver.current) return;
        cancel();
        const token = generation.current, current = value.current;
        if (current.progress === target) { seek(target); return; }
        setStatus(target === 1 ? "Playing " + sourceLabel + " to " + label : "Playing " + label + " to " + sourceLabel);
        animation.current = driver.current(current, {
            progress: target, duration: 1000, ease: "inOutSine", autoplay: false,
            onUpdate: () => { if (generation.current === token) setProgress(current.progress); },
            onComplete: () => {
                if (generation.current !== token) return;
                animation.current = null; current.progress = target;
                setProgress(target); setStatus(target === 1 ? label : sourceLabel);
            },
        });
        animation.current.play();
    };
    return <section className="eye-morph-preview" aria-label="Eye geometry morph preview">
        <h2>{sourceLabel + " to " + label + " eye geometry morph"}</h2>
        <label>Animated eye source: <select aria-label="Animated eye source" value={sourceExpression} onChange={(event) => {
            const next = event.target.value;
            if ((next !== "idle" && next !== "sad") || next === sourceExpression) return;
            seek(0); selectedSource.current = next; setSourceExpression(next);
            setStatus(expressionLabel(next));
            if (next === "sad") { selectedTarget.current = "cry"; setTargetExpression("cry"); }
        }}><option value="idle">Idle</option><option value="sad">Sad</option></select></label>
        <label>Animated eye target: <select aria-label="Animated eye target" value={targetExpression} onChange={(event) => {
            const next = event.target.value;
            if ((next !== "happier" && next !== "sad" && next !== "cry" && next !== "thinking") || next === targetExpression || (sourceExpression === "sad" && next !== "cry")) return;
            seek(0);
            selectedTarget.current = next;
            setTargetExpression(next);
        }}>
            {sourceExpression === "idle" && <option value="happier">Happier</option>}
            {sourceExpression === "idle" && <option value="sad">Sad</option>}
            <option value="cry">Cry</option>
            {sourceExpression === "idle" && <option value="thinking">Thinking</option>}
        </select></label>
        <div className="buttons">
            <button type="button" disabled={!ready || progress === 1} onClick={() => play(1)}>{"Play " + sourceLabel + " → " + label}</button>
            <button type="button" disabled={!ready || progress === 0} onClick={() => play(0)}>{"Reverse " + label + " → " + sourceLabel}</button>
            <button type="button" onClick={() => seek(0)}>{"Reset eyes to " + sourceLabel}</button>
        </div>
        <label>Eye morph progress: <input type="range" min="0" max="1" step="0.001" value={progress}
            onChange={(event) => seek(Number(event.target.value))} /></label>
        <output> {Math.round(progress * 100)}%</output>
        <div className="buttons" aria-label="Eye morph inspection samples">
            {[0, 0.1, 0.25, 0.5, 0.75, 0.9, 1].map((p) => <button type="button" key={p}
                aria-pressed={progress === p} onClick={() => seek(p)}>{Math.round(p * 100)}%</button>)}
        </div>
        <p role="status">{status}</p>
        <p>Current expression: {progress === 0 ? sourceLabel : progress === 1 ? label : sourceLabel + " → " + label}; source: {sourceLabel}; target: {label}.</p>
        <p>Current phase: {progress === 0 ? sourceLabel + " endpoint" : progress === 1 ? label + " endpoint" : "Direct " + sourceLabel + " → " + label + (targetExpression === "cry" ? "; water emergence" : "")}.</p>
        <figure><figcaption>Animated left and right eyes at approved facial positions</figcaption>
            <div className="face-canvas"><div className="face-artwork">
                {(["left", "right"] as const).map((side) => {
                    const key = side === "left" ? "leftEye" : "rightEye";
                    const position = interpolateEyeLayout(FACE_LAYER_LAYOUTS[sourceExpression][key], FACE_LAYER_LAYOUTS[targetExpression][key], progress);
                    const geometry = interpolateEyeGeometry(EYE_EXPRESSION_PRESETS[sourceExpression][side], EYE_EXPRESSION_PRESETS[targetExpression][side], progress);
                    return <div key={side} className="face-layer procedural-eye" data-eye-morph={side} style={{
                        left: position.x / 800 * 100 + "%", top: position.y / 480 * 100 + "%",
                        width: position.width / 800 * 100 + "%", height: position.height / 480 * 100 + "%",
                        zIndex: FACE_LAYER_ORDER.eyes,
                    }}><ProceduralEye geometry={geometry} /></div>;
                })}
            </div></div>
        </figure>
    </section>;
}
