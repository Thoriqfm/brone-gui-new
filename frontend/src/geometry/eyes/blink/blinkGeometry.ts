import { validateEyeGeometry } from "../pathGenerator";
import { EYE_EXPRESSION_PRESETS } from "../presets";
import type { EyeGeometry, EyeConfiguration } from "../types";
import { blinkProgress, interpolateBlinkLid } from "./blinkInterpolator";
import type { BlinkGeometry, BlinkLid } from "./types";

// Compare all source features, including optional details, without depending on property order.
function same(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
    const aa = a as Record<string, unknown>, bb = b as Record<string, unknown>;
    return Object.keys(aa).length === Object.keys(bb).length && Object.keys(aa).every(k => Object.hasOwn(bb, k) && same(aa[k], bb[k]));
}
export function generateBlinkGeometry(eye: EyeConfiguration, progress: number): BlinkGeometry {
    validateEyeGeometry(eye);
    const p = blinkProgress(progress);
    if ("kind" in eye || !same(eye, EYE_EXPRESSION_PRESETS.idle[eye.side]))
        throw new RangeError("Blink Phase 1 requires exact Idle geometry");
    // Identity endpoint: no ellipse conversion, new outline, or changed source details.
    if (p === 0) return eye;
    return idleClosure(eye, p);
}
function idleClosure(eye: EyeGeometry, p: number): BlinkGeometry {
    const [cx, cy] = eye.body.center, [rx, ry] = eye.body.radius;
    const x0 = cx - rx - eye.strokeWidth * 2, x3 = cx + rx + eye.strokeWidth * 2;
    const x1 = x0 + (x3-x0)/3, x2 = x0 + 2*(x3-x0)/3;
    // Meeting center at 60% below the source center; shallow 12%-radius sag.
    // New procedural contour, pending visual approval, not a source asset.
    const edge = cy + ry * .48, control = edge + ry * .12 * 4/3;
    const closed: BlinkLid = { start:[x0,edge], curve:[[x1,control],[x2,control],[x3,edge]] };
    const flat = (y: number): BlinkLid => ({start:[x0,y],curve:[[x1,y],[x2,y],[x3,y]]});
    const upper = interpolateBlinkLid(flat(cy-ry-eye.strokeWidth*2),closed,p);
    const lower = interpolateBlinkLid(flat(cy+ry+eye.strokeWidth*2),closed,p);
    const cubic = (lid: BlinkLid) => "C" + lid.curve.map(q => q.join(" ")).join(" ");
    const path = (lid: BlinkLid) => "M" + lid.start.join(" ") + cubic(lid);
    const reverse: BlinkLid = {start:lower.curve[2],curve:[lower.curve[1],lower.curve[0],lower.start]};
    return {kind:"idle-blink",source:eye,progress:p,upper,lower,
        aperture:path(upper)+"L"+lower.curve[2].join(" ")+cubic(reverse)+"Z",
        upperPath:path(upper),lowerPath:path(lower),interiorVisible:p<1};
}
