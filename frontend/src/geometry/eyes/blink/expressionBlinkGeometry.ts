import { EYE_EXPRESSIONS, EYE_EXPRESSION_PRESETS, type EyeExpression } from "../presets";
import { validateEyeGeometry } from "../pathGenerator";
import type { EyeConfiguration, LayeredEyeGeometry } from "../types";
import { generateBlinkGeometry } from "./blinkGeometry";
import { blinkProgress, interpolateBlinkLid } from "./blinkInterpolator";
import { prepareExpressionBlink } from "./expressionBlinkPresets";
import type { BlinkLid, ExpressionBlinkGeometry } from "./types";

function same(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (!a || !b || typeof a!=="object" || typeof b!=="object") return false;
    const aa=a as Record<string,unknown>, bb=b as Record<string,unknown>;
    return Object.keys(aa).length===Object.keys(bb).length && Object.keys(aa).every(k=>Object.hasOwn(bb,k) && same(aa[k],bb[k]));
}
/** Optional source is validated against the named approved endpoint, never silently substituted. */
export function generateExpressionBlinkGeometry(expression: EyeExpression, side: "left" | "right", progress: number,
    source?: EyeConfiguration): ExpressionBlinkGeometry {
    if (!EYE_EXPRESSIONS.includes(expression) || (side!=="left" && side!=="right")) throw new RangeError("Invalid blink expression or side");
    const eye=source === undefined ? EYE_EXPRESSION_PRESETS[expression][side] : source, p=blinkProgress(progress);
    validateEyeGeometry(eye);
    if (!same(eye,EYE_EXPRESSION_PRESETS[expression][side])) throw new RangeError("Blink requires exact expression source geometry");
    if (expression==="idle" || expression==="happy" || expression==="shock") {
        if (!same(eye,EYE_EXPRESSION_PRESETS.idle[side])) throw new RangeError("Shared blink artwork changed; review correspondence");
        return generateBlinkGeometry(eye,p);
    }
    const config=prepareExpressionBlink(expression,side);
    if (p===0) return eye;
    const upper=p===1?config.closed:interpolateBlinkLid(config.upperOpen,config.closed,p);
    const lower=p===1?config.closed:interpolateBlinkLid(config.lowerOpen,config.closed,p);
    const cubic=(lid: BlinkLid)=>"C"+lid.curve.map(q=>q.join(" ")).join(" ");
    const path=(lid: BlinkLid)=>"M"+lid.start.join(" ")+cubic(lid);
    const reverse: BlinkLid={start:lower.curve[2],curve:[lower.curve[1],lower.curve[0],lower.start]};
    return {kind:"expression-blink",expression,source:eye as LayeredEyeGeometry,progress:p,upper,lower,
        aperture:path(upper)+"L"+lower.curve[2].join(" ")+cubic(reverse)+"Z",
        upperPath:path(upper),lowerPath:path(lower),interiorVisible:p<1};
}
