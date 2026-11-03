import { isEmotion, type Emotion } from "../schemas/faceMessages";
import { FACE_LAYER_LAYOUTS } from "../config/faceLayerLayouts";
import { EYE_EXPRESSION_PRESETS, interpolateEyeGeometry, interpolateEyeLayout } from "../geometry/eyes";
import { MOUTH_EXPRESSION_PRESETS, sampleMouthTransition, type MouthExpression } from "../geometry/mouth";

export type FaceRendererMode = "asset" | "procedural";
export type GeometryEmotion = Emotion;
export function isGeometryEmotion(value: unknown): value is GeometryEmotion {
    return isEmotion(value);
}
// Happy and Happier use the same approved mouth export, at the same layout.
export const PRODUCTION_MOUTH_MAP: Record<GeometryEmotion, MouthExpression> = {
    idle: "idle", happy: "happy", happier: "happy", sad: "sad", cry: "cry", shock: "shock", thinking: "thinking", timeout: "timeout",
};
// These expressions have source-identical eye artwork AND placement. This is
// an explicit asset alias, not substitution of an unsupported expression.
const eyeExpression = <T extends Emotion>(expression: T) =>
    (expression === "happy" || expression === "shock" ? "idle" : expression) as Exclude<T, "happy" | "shock"> | "idle";
export function supportsProductionMorph(from: string, to: string): boolean {
    return isGeometryEmotion(from) && isGeometryEmotion(to) && from !== to;
}
export function productionMorphRoute(from: Emotion, to: Emotion) {
    const a = eyeExpression(from), b = eyeExpression(to);
    const eyeBridge = a !== b && a !== "idle" && b !== "idle" &&
        !((a === "sad" && b === "cry") || (a === "cry" && b === "sad"));
    const ma = PRODUCTION_MOUTH_MAP[from], mb = PRODUCTION_MOUTH_MAP[to];
    const sameMouth = ma === mb || ((ma === "sad" || ma === "cry") && (mb === "sad" || mb === "cry"));
    return { eyes: a === b ? "unchanged" : eyeBridge ? "via idle" : "direct",
        mouth: sameMouth ? "unchanged" : "direct" } as const;
}
export function canonicalProductionGeometry(expression: Emotion) {
    if (!isGeometryEmotion(expression)) throw new RangeError("Expression uses original SVG layers instead of geometry");
    return { eyes: EYE_EXPRESSION_PRESETS[expression],
        mouth: MOUTH_EXPRESSION_PRESETS[PRODUCTION_MOUTH_MAP[expression]].geometry,
        layout: FACE_LAYER_LAYOUTS[expression] };
}
export function sampleProductionGeometry(from: Emotion, to: Emotion, progress: number) {
    if (!isGeometryEmotion(from) || !isGeometryEmotion(to) || from === to) throw new RangeError("Unsupported production morph");
    if (!Number.isFinite(progress)) throw new RangeError("Invalid production progress");
    const a = canonicalProductionGeometry(from), b = canonicalProductionGeometry(to);
    if (progress <= 0) return a;
    if (progress >= 1) return b;
    const p = progress, route = productionMorphRoute(from, to);
    const ea = eyeExpression(from), eb = eyeExpression(to);
    // Eyes retain their existing approved legs independently of the mouth route.
    const eyeFrom = route.eyes === "via idle" && p >= .5 ? "idle" : ea;
    const eyeTo = route.eyes === "via idle" && p < .5 ? "idle" : eb;
    const ep = route.eyes === "via idle" ? p < .5 ? p * 2 : (p - .5) * 2 : p;
    const eyes = route.eyes === "unchanged" ? a.eyes : {
        left: eyeFrom === eyeTo ? EYE_EXPRESSION_PRESETS[eyeFrom].left : interpolateEyeGeometry(EYE_EXPRESSION_PRESETS[eyeFrom].left, EYE_EXPRESSION_PRESETS[eyeTo].left, ep),
        right: eyeFrom === eyeTo ? EYE_EXPRESSION_PRESETS[eyeFrom].right : interpolateEyeGeometry(EYE_EXPRESSION_PRESETS[eyeFrom].right, EYE_EXPRESSION_PRESETS[eyeTo].right, ep),
    };
    const ma = PRODUCTION_MOUTH_MAP[from], mb = PRODUCTION_MOUTH_MAP[to];
    const mouth = route.mouth === "unchanged" ? a.mouth :
        sampleMouthTransition(ma, mb, p);
    return { eyes, mouth, layout: { ...a.layout,
        leftEye: interpolateEyeLayout(FACE_LAYER_LAYOUTS[eyeFrom].leftEye, FACE_LAYER_LAYOUTS[eyeTo].leftEye, ep),
        rightEye: interpolateEyeLayout(FACE_LAYER_LAYOUTS[eyeFrom].rightEye, FACE_LAYER_LAYOUTS[eyeTo].rightEye, ep),
        mouth: interpolateEyeLayout(a.layout.mouth, b.layout.mouth, p),
    } };
}
export type ProductionGeometrySample = ReturnType<typeof canonicalProductionGeometry> | ReturnType<typeof sampleProductionGeometry>;
/** Identify the already-existing eye leg without changing face routing. */
export function productionEyeMorphContext(from: Emotion,to: Emotion,p: number) {
    if (from === "timeout" || to === "timeout") throw new RangeError("Timeout morphs do not blink");
    if (!isGeometryEmotion(from) || !isGeometryEmotion(to)) throw new RangeError("Unsupported eye morph context");
    if (p<=0 || from===to) return {from,to:from,morphProgress:0};
    if (p>=1) return {from:to,to,morphProgress:0};
    const a=eyeExpression(from), b=eyeExpression(to), route=productionMorphRoute(from,to);
    if (route.eyes==="unchanged") return {from,to:from,morphProgress:0};
    return {from:route.eyes==="via idle" && p>=.5?"idle" as const:a,
        to:route.eyes==="via idle" && p<.5?"idle" as const:b,
        morphProgress:route.eyes==="via idle"?p<.5?p*2:(p-.5)*2:p};
}
