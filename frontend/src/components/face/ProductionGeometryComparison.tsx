import { useEffect, useRef, useState } from "react";
import { startAutomaticBlink } from "../../animation/automaticBlink";
import { createBlinkChannel, createMorphBlinkPlayback } from "../../animation/morphBlinkPlayback";
import { useAnimationEngine } from "../../animation/useAnimationEngine";
import MorphBlinkPreview from "./eyes/MorphBlinkPreview";
import { EMOTIONS, isEmotion, type Emotion } from "../../schemas/faceMessages";
import { productionMorphRoute } from "../../animation/productionGeometry";
import FaceRenderer from "./FaceRenderer";
import FullImageFaceRenderer from "./FullImageFaceRenderer";

/** Local inspection state never invokes the production expression controller. */
export default function ProductionGeometryComparison() {
    const [expression, setExpression] = useState<Emotion>("idle");
    const [previous, setPrevious] = useState<Emotion>("idle");
    const [duration, setDuration] = useState(1000);
    const [view, setView] = useState("all");
    const [automaticBlink, setAutomaticBlink] = useState(true);
    const [open, setOpen] = useState(false);
    const [channel]=useState(createBlinkChannel),[manualBlink,setManualBlink]=useState(false),[ready,setReady]=useState(false);
    const morph=useRef<HTMLSpanElement>(null),blink=useRef<HTMLSpanElement>(null);
    const playback=useRef<ReturnType<typeof createMorphBlinkPlayback>|null>(null);
    const {rootRef}=useAnimationEngine(engine=>{
        const current=createMorphBlinkPlayback(engine,morph.current!,blink.current!,()=>{},channel);
        playback.current=current;setReady(true);
        return ()=>{current.dispose();if(playback.current===current)playback.current=null;};
    });
    useEffect(() => {
        if (!import.meta.env.DEV || !ready || !open || !automaticBlink || view === "asset") return;
        let stop: (() => void) | undefined;
        const sync = () => {
            stop?.(); stop = undefined;
            if (!document.hidden && playback.current) stop = startAutomaticBlink(playback.current);
        };
        sync();
        document.addEventListener("visibilitychange", sync);
        return () => { stop?.(); document.removeEventListener("visibilitychange", sync); };
    }, [ready, open, automaticBlink, view]);
    const route = productionMorphRoute(previous, expression);
    if (!import.meta.env.DEV) return null;
    return <details className="production-geometry-comparison" onToggle={event => {
        if (event.target === event.currentTarget) setOpen(event.currentTarget.open);
    }}>
        <summary>Production renderer comparison</summary>
        <section ref={rootRef} aria-label="Isolated production geometry comparison">
            <span hidden ref={morph} data-progress="0"/><span hidden ref={blink} data-progress="0"/>
            <label>Comparison expression: <select value={expression} onChange={event => {
                if (!isEmotion(event.target.value)) return;
                setPrevious(expression); setExpression(event.target.value);
            }}>{EMOTIONS.map(name => <option key={name}>{name}</option>)}</select></label>{" "}
            <label>Comparison view: <select value={view} onChange={event => setView(event.target.value)}>
                <option value="all">Reference, asset and procedural side by side</option>
                <option value="asset">Asset renderer</option><option value="procedural">Procedural renderer</option>
            </select></label>{" "}
            <label>Transition duration: <select value={duration} onChange={event => setDuration(Number(event.target.value))}>
                <option value={0}>Immediate endpoints</option><option value={300}>300 ms</option><option value={1000}>1000 ms</option>
            </select></label>
            <label><input type="checkbox" checked={automaticBlink} onChange={e=>setAutomaticBlink(e.target.checked)}/> Automatic blinking (3–6 seconds)</label>
            <label><input type="checkbox" checked={manualBlink} onChange={e=>setManualBlink(e.target.checked)}/> Enable manual morph-aware blink validation</label>
            <div className="buttons"><button disabled={!ready || !(manualBlink || automaticBlink)} onClick={()=>playback.current?.playBlink()}>Play production Blink</button>
                <button onClick={()=>playback.current?.seekBlink(0)}>Reset production Blink</button></div>
            <p role="status">Current comparison expression: {expression}. Renderer status: asset fallback available; procedural opt-in; blinking {automaticBlink ? (view === "asset" ? "automatic paused (asset view)" : "automatic development validation") : manualBlink?"manual development validation":"disabled"}.
                {" "}{previous} → {expression}: {previous === expression ? "no expression change" : `procedural morph; eyes ${route.eyes}; mouth ${route.mouth}`}.
                {" "}Asset renderer retains its original fades. The procedural renderer morphs every expression pair; some channels pass through Idle.
                {" "}These controls do not change the live expression.</p>
        </section>
        <div className={view === "all" ? "face-comparison" : ""}>
            {view === "all" && <figure><figcaption>Original full-image reference</figcaption><FullImageFaceRenderer expression={expression} /></figure>}
            {(view === "all" || view === "asset") && <figure><figcaption>Original asset renderer</figcaption>
                <FaceRenderer renderer="asset" expression={expression} duration={duration} /></figure>}
            {(view === "all" || view === "procedural") && <figure><figcaption>Production procedural renderer</figcaption>
                <FaceRenderer renderer="procedural" expression={expression} duration={duration} blinkChannel={manualBlink || automaticBlink?channel:undefined} /></figure>}
        </div>
        <MorphBlinkPreview/>
    </details>;
}
