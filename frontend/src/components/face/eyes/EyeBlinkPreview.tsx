import { useEffect, useRef, useState } from "react";
import type { animate } from "animejs";
import { EYE_EXPRESSION_PRESETS, EYE_EXPRESSIONS, type EyeExpression } from "../../../geometry/eyes";
import { blinkProgress, generateExpressionBlinkGeometry } from "../../../geometry/eyes/blink";
import { FACE_LAYER_LAYOUTS, FACE_LAYER_ORDER } from "../../../config/faceLayerLayouts";
import BlinkEye, { applyExpressionBlinkGeometry } from "./ExpressionBlinkEye";

export const DEFAULT_BLINK_TIMING = { closing:100, hold:40, opening:150 } as const;
type Timing = { closing:number; hold:number; opening:number };
export default function EyeBlinkPreview({ timing = DEFAULT_BLINK_TIMING }: { timing?: Timing }) {
    for (const ms of [timing.closing, timing.hold, timing.opening]) if (!Number.isFinite(ms) || ms < 0) throw new RangeError("Invalid blink timing");
    const [ready, setReady] = useState(false), [status, setStatus] = useState("Loading animation");
    const host = useRef<HTMLDivElement>(null), slider = useRef<HTMLInputElement>(null), output = useRef<HTMLOutputElement>(null);
    const driver = useRef<typeof animate | null>(null), animation = useRef<ReturnType<typeof animate> | null>(null);
    const value = useRef({progress:0}), generation = useRef(0);
    const [expression, setExpression] = useState<EyeExpression>("idle");
    const selectedExpression = useRef<EyeExpression>("idle");
    const cancel = () => {
        generation.current++;
        value.current = {progress:value.current.progress};
        animation.current?.cancel(); animation.current = null;
    };
    const draw = (p: number) => {
        value.current.progress = p;
        host.current?.querySelectorAll<SVGSVGElement>("svg[data-blink-side]").forEach(svg => {
            const side = svg.getAttribute("data-blink-side") === "left" ? "left" : "right";
            applyExpressionBlinkGeometry(svg,generateExpressionBlinkGeometry(selectedExpression.current,side,p));
        });
        if (slider.current) slider.current.value = String(p);
        if (output.current) output.current.textContent = Math.round(p*100) + "%";
    };
    useEffect(() => {
        let stopped = false;
        void import("animejs").then(({animate}) => {
            if (stopped) return;
            driver.current = animate; setReady(true); setStatus(value.current.progress===0?"Ready":value.current.progress===1?"Closed":"Manual inspection");
        }).catch(() => { if (!stopped) setStatus("Animation failed to load"); });
        return () => { stopped = true; cancel(); driver.current = null; };
    }, []);
    const seek = (next: number) => {
        if (!Number.isFinite(next)) return;
        cancel(); const p = blinkProgress(next); draw(p);
        setStatus(p === 0 ? "Open" : p === 1 ? "Closed" : "Manual inspection");
    };
    const play = () => {
        if (!driver.current) return;
        cancel(); draw(0);
        const token = generation.current, current = value.current;
        const phase = (target: 0 | 1, duration: number, delay: number, label: string, done: () => void) => {
            if (generation.current !== token || !driver.current) return;
            setStatus(label);
            animation.current = driver.current(current, {progress:target,duration,delay,ease:"inOutSine",autoplay:false,
                onBegin: () => { if (generation.current === token && target === 0) setStatus("Opening"); },
                onUpdate: () => { if (generation.current === token) draw(current.progress); },
                onComplete: () => {
                    if (generation.current !== token) return;
                    animation.current = null; draw(target); done();
                }});
            animation.current.play();
        };
        phase(1,timing.closing,0,"Closing",() => {
            phase(0,timing.opening,timing.hold,"Closed hold",() => setStatus("Open"));
        });
    };
    return <section className="eye-morph-preview" aria-label="Procedural eye blink preview">
        <h2>{expression[0].toUpperCase()+expression.slice(1)} procedural eye blinking (development only)</h2>
        <label>Blink expression: <select aria-label="Blink expression" value={expression} onChange={event => {
            const next = event.target.value as EyeExpression;
            if (!EYE_EXPRESSIONS.includes(next) || next === selectedExpression.current) return;
            seek(0);
            selectedExpression.current = next;
            setExpression(next);
        }}>{EYE_EXPRESSIONS.map(name => <option key={name} value={name}>{name[0].toUpperCase()+name.slice(1)}</option>)}</select></label>
        <p>Current expression: {expression.toUpperCase()}</p>
        <div className="buttons"><button type="button" disabled={!ready} onClick={play}>Play Blink</button>
            <button type="button" onClick={() => seek(0)}>Reset</button></div>
        <label>Blink closure progress: <input ref={slider} type="range" min="0" max="1" step="0.001" defaultValue="0"
            onChange={event => seek(Number(event.target.value))} /></label>
        <output ref={output}>0%</output>
        <div className="buttons" aria-label="Blink inspection samples">{[0,.25,.5,.75,.9,1].map(p =>
            <button type="button" key={p} onClick={() => seek(p)}>{Math.round(p*100)}%</button>)}</div>
        <p role="status">{status}</p>
        <p>Progress measures aperture closure, not playback time. Closed contour awaits visual approval.</p>
        <div ref={host} className="face-canvas"><div className="face-artwork">{(["left","right"] as const).map(side => {
            const pos = FACE_LAYER_LAYOUTS[expression][side === "left" ? "leftEye" : "rightEye"];
            return <div key={expression+"-"+side} className="face-layer procedural-eye" style={{left:pos.x/800*100+"%",top:pos.y/480*100+"%",
                width:pos.width/800*100+"%",height:pos.height/480*100+"%",zIndex:FACE_LAYER_ORDER.eyes}}>
                <BlinkEye expression={expression} geometry={EYE_EXPRESSION_PRESETS[expression][side]} /></div>;
        })}</div></div>
    </section>;
}
