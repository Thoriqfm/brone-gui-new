import { createElement, useId, useLayoutEffect, useRef } from "react";
import { generateEyeLayers } from "../../../geometry/eyes";
import type { GeneratedEyeNode } from "../../../geometry/eyes/layerGenerator";
import { generateMorphAwareBlinkGeometry, eyeBlinkBoundary, type MorphBlinkContext, type MorphAwareBlinkGeometry } from "../../../geometry/eyes/blink";
import { EYE_EXPRESSION_PRESETS } from "../../../geometry/eyes";
import { updateProductionEyeArtwork } from "../../../animation/productionGeometryDom";
import type { BlinkChannel } from "../../../animation/morphBlinkPlayback";
import ExpressionBlinkEye from "./ExpressionBlinkEye";
import BlinkEye from "./BlinkEye";

export function blinkSource(g: MorphAwareBlinkGeometry) { return "source" in g ? g.source : g; }
function LayeredMorphEye({ context, geometry }: { context: MorphBlinkContext; geometry: MorphAwareBlinkGeometry }) {
    const id = "morph-blink-"+useId(), source = blinkSource(geometry);
    if (!("kind" in source)) throw new RangeError("Layered morph eye required");
    const blink = "source" in geometry ? geometry : null, scene = generateEyeLayers(source,id+"-art");
    const render = (node: GeneratedEyeNode, key: number): React.ReactNode => createElement(node.tag,{...node.props,key},...node.children.map(render));
    return <svg xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" width={source.width} height={source.height}
        viewBox={scene.viewBox} fill="none" aria-hidden="true" data-blink-side={context.side} data-blink-clip={id+"-aperture"}>
        <defs><clipPath id={id+"-aperture"} clipPathUnits="userSpaceOnUse"><path data-blink-aperture="" d={blink?.aperture ?? ""} /></clipPath>
            <clipPath id={id+"-boundary"} clipPathUnits="userSpaceOnUse"><path d={eyeBlinkBoundary(source)} /></clipPath></defs>
        <g data-blink-interior="" visibility={blink?.interiorVisible===false?"hidden":"visible"}
            clipPath={blink?`url(#${id}-aperture)`:"none"}>{scene.layers.map(render)}</g>
        <g clipPath={`url(#${id}-boundary)`} stroke="black" strokeWidth={4} fill="none">
            <path data-blink-upper="" d={blink?.upperPath ?? ""}/><path data-blink-lower="" d={blink && blink.progress<1?blink.lowerPath:""}/>
        </g>
    </svg>;
}
export function MorphBlinkGeometryEye({ context }: {context: MorphBlinkContext}) {
    const g = generateMorphAwareBlinkGeometry(context), source = blinkSource(g);
    const m = Math.max(0,Math.min(1,context.morphProgress));
    if (m===0 || m===1 || context.from===context.to) return <ExpressionBlinkEye expression={m===1?context.to:context.from} geometry={g as Parameters<typeof ExpressionBlinkEye>[0]["geometry"]} />;
    if (!("kind" in source)) {
        const geometry = "source" in g ? {...g,kind:"idle-blink" as const,source} : source;
        return <BlinkEye geometry={geometry} />;
    }
    return <LayeredMorphEye context={context} geometry={g} />;
}

/** All source paint stays inside the original outer SVG, without nested viewports. */
export function applyMorphBlinkEye(svg: SVGSVGElement, context: MorphBlinkContext, idleTemplate: SVGElement, scope: string): void {
    const geometry = generateMorphAwareBlinkGeometry(context), source = blinkSource(geometry);
    svg.setAttribute("width",String(source.width)); svg.setAttribute("height",String(source.height));
    svg.setAttribute("viewBox",`0 0 ${source.width} ${source.height}`);
    const interior = svg.querySelector<SVGGElement>("[data-blink-interior]")!;
    updateProductionEyeArtwork(interior,source,scope+"-art",idleTemplate);
    const blink = "source" in geometry ? geometry : null;
    svg.querySelector("[data-blink-aperture]")!.setAttribute("d",blink?.aperture ?? "");
    interior.setAttribute("visibility",blink?.interiorVisible===false?"hidden":"visible");
    interior.setAttribute("clip-path",blink?`url(#${svg.getAttribute("data-blink-clip")})`:"none");
    svg.firstElementChild!.children[1].firstElementChild!.setAttribute("d",eyeBlinkBoundary(source));
    svg.querySelector("[data-blink-upper]")!.setAttribute("d",blink?.upperPath ?? "");
    svg.querySelector("[data-blink-lower]")!.setAttribute("d",blink && blink.progress<1?blink.lowerPath:"");
}
const surfaces = new WeakMap<SVGSVGElement,(context: MorphBlinkContext)=>void>();
export function updateMorphBlinkSurface(svg: SVGSVGElement, context: MorphBlinkContext): void {
    const update = surfaces.get(svg);
    if (!update) throw new Error("Morph blink surface is not mounted");
    update(context);
}
export default function MorphBlinkEye({ context, channel }: { context: MorphBlinkContext; channel: BlinkChannel }) {
    const host = useRef<HTMLDivElement>(null), id = "surface-"+useId();
    // After mount the imperative adapter owns this scaffold. An unrelated React
    // render must not restore the initial morph frame over the displayed frame.
    const initial = useRef({...context,blinkProgress:channel.progress});
    useLayoutEffect(() => {
        const svg = host.current!.querySelector<SVGSVGElement>("[data-active-eye] svg")!;
        const template = host.current!.querySelector<SVGGElement>("[data-idle-template] [data-blink-interior]")!;
        let current = initial.current;
        const draw = () => applyMorphBlinkEye(svg,{...current,blinkProgress:channel.progress},template,id);
        surfaces.set(svg,next=>{current=next;draw();});
        const unsubscribe = channel.subscribe(draw); draw();
        return () => { unsubscribe(); surfaces.delete(svg); };
    },[channel,id]);
    return <div ref={host} style={{display:"contents"}}>
        <div hidden data-idle-template=""><BlinkEye geometry={EYE_EXPRESSION_PRESETS.idle[context.side]}/></div>
        <div data-active-eye="" style={{display:"contents"}}><MorphBlinkGeometryEye context={initial.current}/></div>
    </div>;
}
