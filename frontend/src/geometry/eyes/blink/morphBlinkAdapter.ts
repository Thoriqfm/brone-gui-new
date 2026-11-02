import { EYE_EXPRESSION_PRESETS, EYE_EXPRESSIONS, type EyeExpression } from "../presets";
import { interpolateEyeGeometry } from "../geometryInterpolator";
import { generateEyePath } from "../layerGenerator";
import { generateEyePaths, validateEyeGeometry } from "../pathGenerator";
import type { EyeConfiguration } from "../types";
import { generateExpressionBlinkGeometry } from "./expressionBlinkGeometry";
import { prepareExpressionBlink } from "./expressionBlinkPresets";
import { blinkProgress, interpolateBlinkLid } from "./blinkInterpolator";
import type { BlinkLid, ExpressionBlinkGeometry } from "./types";

export const MORPH_BLINK_PAIRS = [["idle","happier"],["idle","sad"],["idle","cry"],["sad","cry"],["idle","thinking"]] as const;
export interface MorphBlinkContext {
    from: EyeExpression; to: EyeExpression; side: "left" | "right";
    morphProgress: number; blinkProgress: number; current?: EyeConfiguration;
}
export interface MorphBlinkGeometry {
    readonly kind: "morph-blink"; readonly source: EyeConfiguration; readonly progress: number;
    readonly upper: BlinkLid; readonly lower: BlinkLid;
    readonly aperture: string; readonly upperPath: string; readonly lowerPath: string;
    readonly boundary: string; readonly interiorVisible: boolean;
}
export type MorphAwareBlinkGeometry = ExpressionBlinkGeometry | MorphBlinkGeometry;
export function sameEyeData(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
    const x = a as Record<string, unknown>, y = b as Record<string, unknown>;
    return Object.keys(x).length === Object.keys(y).length && Object.keys(x).every(k => Object.hasOwn(y,k) && sameEyeData(x[k],y[k]));
}
export function eyeBlinkBoundary(eye: EyeConfiguration): string {
    if (!("kind" in eye)) return generateEyePaths(eye).outline;
    const first = eye.layers[0], outline = first.tag === "path" ? first : eye.layers[1];
    if (outline.tag !== "path") throw new RangeError("Missing actual eye silhouette");
    return generateEyePath(outline.commands);
}
function supports(from: EyeExpression, to: EyeExpression): boolean {
    return from === to || MORPH_BLINK_PAIRS.some(([a,b]) => (from === a && to === b) || (from === b && to === a));
}
const sharedConfigurations = new Map<string,{upperOpen:BlinkLid;lowerOpen:BlinkLid;closed:BlinkLid}>();
function configuration(expression: EyeExpression, side: "left" | "right") {
    if (expression !== "idle" && expression !== "happy" && expression !== "shock") return prepareExpressionBlink(expression,side);
    const key=expression+":"+side, cached=sharedConfigurations.get(key);
    if (cached) return cached;
    const closed = generateExpressionBlinkGeometry(expression,side,1);
    if (!("upper" in closed)) throw new RangeError("Missing canonical blink landmarks");
    // The original shared-family generator keeps these native open supports
    // private. Derive them from its exact source body and stroke measurements;
    // use its public full-closure result for the meeting contour.
    const g = EYE_EXPRESSION_PRESETS[expression][side], [cx,cy] = g.body.center, [rx,ry] = g.body.radius;
    const xs = [cx-rx-g.strokeWidth*2, cx+rx+g.strokeWidth*2];
    const flat = (y: number): BlinkLid => ({ start:[xs[0],y], curve:[
        [xs[0]+(xs[1]-xs[0])/3,y],[xs[0]+2*(xs[1]-xs[0])/3,y],[xs[1],y]] });
    const result={upperOpen:flat(cy-ry-g.strokeWidth*2),lowerOpen:flat(cy+ry+g.strokeWidth*2),closed:closed.upper};
    sharedConfigurations.set(key,result); return result;
}
export function generateMorphAwareBlinkGeometry(context: MorphBlinkContext): MorphAwareBlinkGeometry {
    if (!context || !EYE_EXPRESSIONS.includes(context.from) || !EYE_EXPRESSIONS.includes(context.to) ||
        (context.side !== "left" && context.side !== "right") || !supports(context.from,context.to))
        throw new RangeError("Unsupported morph blink context");
    const m = blinkProgress(context.morphProgress), b = blinkProgress(context.blinkProgress);
    const from = EYE_EXPRESSION_PRESETS[context.from][context.side], to = EYE_EXPRESSION_PRESETS[context.to][context.side];
    const expected = context.from === context.to ? from : interpolateEyeGeometry(from,to,m);
    const current = context.current === undefined ? expected : context.current;
    validateEyeGeometry(current);
    if (!sameEyeData(current,expected)) throw new RangeError("Current geometry does not match morph context");
    if (b === 0) return current;
    if (m === 0 || context.from === context.to) return generateExpressionBlinkGeometry(context.from,context.side,b,current);
    if (m === 1) return generateExpressionBlinkGeometry(context.to,context.side,b,current);
    const a = configuration(context.from,context.side), z = configuration(context.to,context.side);
    const closed = interpolateBlinkLid(a.closed,z.closed,m);
    const upper = b === 1 ? closed : interpolateBlinkLid(interpolateBlinkLid(a.upperOpen,z.upperOpen,m),closed,b);
    const lower = b === 1 ? closed : interpolateBlinkLid(interpolateBlinkLid(a.lowerOpen,z.lowerOpen,m),closed,b);
    const path = (lid: BlinkLid) => "M"+lid.start.join(" ")+"C"+lid.curve.map(p=>p.join(" ")).join(" ");
    const reverse: BlinkLid = {start:lower.curve[2],curve:[lower.curve[1],lower.curve[0],lower.start]};
    return {kind:"morph-blink",source:current,progress:b,upper,lower,
        aperture:path(upper)+"L"+reverse.start.join(" ")+path(reverse).replace(/^M[^C]+/,"")+"Z",
        upperPath:path(upper),lowerPath:path(lower),boundary:eyeBlinkBoundary(current),interiorVisible:b<1};
}
