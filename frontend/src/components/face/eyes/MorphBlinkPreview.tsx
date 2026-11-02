import { useRef, useState } from "react";
import { EYE_EXPRESSIONS, EYE_EXPRESSION_PRESETS, interpolateEyeGeometry, interpolateEyeLayout, type EyeExpression } from "../../../geometry/eyes";
import { MORPH_BLINK_PAIRS } from "../../../geometry/eyes/blink";
import { FACE_LAYER_LAYOUTS } from "../../../config/faceLayerLayouts";
import { positionGeometry } from "../../../animation/productionGeometryDom";
import { createBlinkChannel, createMorphBlinkPlayback } from "../../../animation/morphBlinkPlayback";
import { useAnimationEngine } from "../../../animation/useAnimationEngine";
import MorphBlinkEye, { updateMorphBlinkSurface } from "./MorphBlinkEye";

export default function MorphBlinkPreview() {
    const [pair,setPair]=useState<readonly [EyeExpression,EyeExpression]>(["idle","happier"]);
    const selected=useRef(pair); selected.current=pair;
    const [channel]=useState(createBlinkChannel), [ready,setReady]=useState(false);
    const playback=useRef<ReturnType<typeof createMorphBlinkPlayback>|null>(null);
    const morph=useRef<HTMLSpanElement>(null),blink=useRef<HTMLSpanElement>(null);
    const mSlider=useRef<HTMLInputElement>(null),bSlider=useRef<HTMLInputElement>(null),info=useRef<HTMLParagraphElement>(null);
    const draw=(m: number,b: number) => {
        const [from,to]=selected.current;
        const geometries:string[]=[];
        rootRef.current?.querySelectorAll<HTMLDivElement>("[data-preview-eye]").forEach(node=>{
            const side=node.getAttribute("data-preview-eye") as "left"|"right", key=side==="left"?"leftEye":"rightEye";
            const current=from===to?EYE_EXPRESSION_PRESETS[from][side]:interpolateEyeGeometry(EYE_EXPRESSION_PRESETS[from][side],EYE_EXPRESSION_PRESETS[to][side],m);
            geometries.push(`${side}: ${"kind" in current?"layered":"ellipse"} ${current.width.toFixed(2)} × ${current.height.toFixed(2)}`);
            positionGeometry(node,interpolateEyeLayout(FACE_LAYER_LAYOUTS[from][key],FACE_LAYER_LAYOUTS[to][key],m));
            updateMorphBlinkSurface(node.querySelector("[data-active-eye] svg")!,{from,to,side,morphProgress:m,blinkProgress:b,current});
        });
        if(mSlider.current)mSlider.current.value=String(m);
        if(bSlider.current)bSlider.current.value=String(b);
        if(info.current)info.current.textContent=`Source: ${from}; target: ${to}; morph ${(m*100).toFixed(1)}%; blink ${(b*100).toFixed(1)}%. ${geometries.join("; ")}. Adapter validation: valid. Animation: ${playback.current?.isMorphing?"morphing; ":""}${b===0?"open":b===1?"closed hold":"blinking"}.`;
    };
    const {rootRef}=useAnimationEngine(engine=>{
        const current=createMorphBlinkPlayback(engine,morph.current!,blink.current!,draw,channel);
        playback.current=current; setReady(true);
        return ()=>{current.dispose();if(playback.current===current)playback.current=null;};
    });
    const choose=(next:readonly [EyeExpression,EyeExpression])=>{
        selected.current=next; playback.current?.seekMorph(0); setPair(next);
    };
    const [from,to]=pair;
    return <section ref={rootRef} className="eye-morph-preview" aria-label="Morph-aware blink preview">
        <h2>Morph-aware blinking validation</h2>
        <span hidden ref={morph} data-progress="0"/><span hidden ref={blink} data-progress="0"/>
        <label>Canonical expression: <select value={from===to?from:""} onChange={e=>{
            const value=e.target.value as EyeExpression;if(EYE_EXPRESSIONS.includes(value))choose([value,value]);
        }}><option value="" disabled>Morph pair selected</option>{EYE_EXPRESSIONS.map(name=><option key={name}>{name}</option>)}</select></label>{" "}
        <label>Morph pair: <select value={from===to?"":from+":"+to} onChange={e=>{
            const match=MORPH_BLINK_PAIRS.flatMap(([a,b])=>[[a,b],[b,a]] as const).find(([a,b])=>a+":"+b===e.target.value);
            if(match)choose(match);
        }}><option value="" disabled>Canonical selected</option>{MORPH_BLINK_PAIRS.flatMap(([a,b])=>[[a,b],[b,a]] as const).map(([a,b])=><option key={a+":"+b} value={a+":"+b}>{a} → {b}</option>)}</select></label>
        <div className="buttons">
            <button disabled={!ready || from===to} onClick={()=>playback.current?.playMorph(1,1000)}>Play Morph</button>
            <button disabled={!ready} onClick={()=>playback.current?.playBlink()}>Play Blink</button>
            <button disabled={!ready || from===to} onClick={()=>{playback.current?.playMorph(1,1000);playback.current?.playBlink();}}>Play Morph + Blink</button>
            <button onClick={()=>playback.current?.seekMorph(0)}>Reset Morph</button>
            <button onClick={()=>playback.current?.seekBlink(0)}>Reset Blink</button>
        </div>
        <label>Morph progress: <input ref={mSlider} type="range" min="0" max="1" step=".001" defaultValue="0" onChange={e=>playback.current?.seekMorph(Number(e.target.value))}/></label>{" "}
        <label>Blink progress: <input ref={bSlider} type="range" min="0" max="1" step=".001" defaultValue="0" onChange={e=>playback.current?.seekBlink(Number(e.target.value))}/></label>
        <p ref={info} role="status">Source: {from}; target: {to}; morph 0%; blink {Math.round(channel.progress*100)}%. Left/right: independent canonical geometry. Adapter validation: valid. Animation: {ready?channel.progress===1?"closed":"ready":"loading"}.</p>
        <p>Manual inspection only. Pair selection establishes a new inspection context; blink progress is retained. Closed intermediate contours require visual approval.</p>
        <div className="face-canvas"><div className="face-artwork">{(["left","right"] as const).map(side=>{
            const p=FACE_LAYER_LAYOUTS[from][side==="left"?"leftEye":"rightEye"];
            return <div key={from+to+side} data-preview-eye={side} className="face-layer procedural-eye" style={{left:p.x/8+"%",top:p.y/4.8+"%",width:p.width/8+"%",height:p.height/4.8+"%"}}>
                <MorphBlinkEye channel={channel} context={{from,to,side,morphProgress:0,blinkProgress:channel.progress}}/>
            </div>;
        })}</div></div>
    </section>;
}
