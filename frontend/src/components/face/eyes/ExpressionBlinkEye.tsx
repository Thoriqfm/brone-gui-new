import { createElement, useId } from "react";
import type { EyeExpression, LayeredEyeGeometry } from "../../../geometry/eyes";
import { generateEyeLayers, type GeneratedEyeNode } from "../../../geometry/eyes/layerGenerator";
import { prepareExpressionBlink, generateExpressionBlinkGeometry } from "../../../geometry/eyes/blink";
import type { ExpressionBlinkGeometry, FamilyBlinkGeometry } from "../../../geometry/eyes/blink";
import BlinkEye, { applyBlinkGeometry } from "./BlinkEye";

/** Compatible extension: the Phase 1 renderer and its exact SVG output remain untouched. */
export default function ExpressionBlinkEye({ expression, geometry }: {expression:EyeExpression;geometry:ExpressionBlinkGeometry}) {
    const source = "kind" in geometry && (geometry.kind==="idle-blink" || geometry.kind==="expression-blink") ? geometry.source : geometry;
    generateExpressionBlinkGeometry(expression,source.side,0,source);
    if (!("kind" in geometry) || geometry.kind==="idle-blink") return <BlinkEye geometry={geometry} />;
    return <LayeredBlinkEye expression={expression} geometry={geometry} />;
}
function LayeredBlinkEye({expression,geometry}:{expression:EyeExpression;geometry:LayeredEyeGeometry | FamilyBlinkGeometry}) {
    const id="expression-blink-"+useId(), blink=geometry.kind==="expression-blink"?geometry:null;
    const source=geometry.kind==="expression-blink"?geometry.source:geometry;
    const config=prepareExpressionBlink(expression,source.side), scene=generateEyeLayers(source,id+"-art");
    const aperture=id+"-aperture", boundary=id+"-boundary";
    const render=(node:GeneratedEyeNode,key:number):React.ReactNode => createElement(node.tag,{...node.props,key},...node.children.map(render));
    return <svg xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink"
        width={source.width} height={source.height} viewBox={scene.viewBox} fill="none" aria-hidden="true"
        data-blink-side={source.side} data-blink-clip={aperture}>
        <defs><clipPath id={aperture} clipPathUnits="userSpaceOnUse"><path data-blink-aperture="" d={blink?.aperture ?? ""} /></clipPath>
            <clipPath id={boundary} clipPathUnits="userSpaceOnUse"><path d={config.boundary} /></clipPath></defs>
        <g data-blink-interior="" visibility={blink?.interiorVisible===false?"hidden":"visible"}
            clipPath={blink?'url(#'+aperture+')':"none"}>{scene.layers.map(render)}</g>
        <g clipPath={'url(#'+boundary+')'} stroke={config.stroke} strokeWidth={config.strokeWidth} fill="none">
            <path data-blink-upper="" d={blink?.upperPath ?? ""} />
            <path data-blink-lower="" d={blink && blink.progress<1?blink.lowerPath:""} />
        </g>
    </svg>;
}
/** Only the aperture attributes change during playback. All source nodes/resources stay mounted. */
export function applyExpressionBlinkGeometry(svg: SVGSVGElement, geometry: ExpressionBlinkGeometry): void {
    if (!("kind" in geometry) || geometry.kind==="idle-blink") { applyBlinkGeometry(svg,geometry); return; }
    const blink=geometry.kind==="expression-blink"?geometry:null;
    svg.querySelector("[data-blink-aperture]")!.setAttribute("d",blink?.aperture ?? "");
    const interior=svg.querySelector("[data-blink-interior]")!;
    interior.setAttribute("visibility",blink?.interiorVisible===false?"hidden":"visible");
    interior.setAttribute("clip-path",blink?'url(#'+svg.getAttribute("data-blink-clip")+')':"none");
    svg.querySelector("[data-blink-upper]")!.setAttribute("d",blink?.upperPath ?? "");
    svg.querySelector("[data-blink-lower]")!.setAttribute("d",blink && blink.progress<1?blink.lowerPath:"");
}
