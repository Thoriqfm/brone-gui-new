import type { MouthContour, MouthGeometry, MouthPoint } from "./types";
import { validateMouthGeometry } from "./pathGenerator";
import type { LayerPosition } from "../../config/faceLayerLayouts";

/** Finite out-of-range values clamp; NaN/Infinity and nonnumbers are rejected. */
function normalizedProgress(progress: number): number {
    if (!Number.isFinite(progress)) throw new RangeError("Mouth progress must be finite");
    return Math.max(0, Math.min(1, progress));
}
const lerp = (a: number, b: number, t: number) => t === 0 ? a : t === 1 ? b : a * (1 - t) + b * t;

/** Compatible normalized control nets only; no path-string or asset interpolation. */
export function interpolateMouthGeometry(from: MouthGeometry, to: MouthGeometry, progress: number): MouthGeometry {
    const t = normalizedProgress(progress);
    for (const [label, geometry] of [["from", from], ["to", to]] as const) {
        try { validateMouthGeometry(geometry); }
        catch (error) { throw new RangeError("Invalid " + label + " mouth geometry: " + (error as Error).message); }
    }
    const fromOutline = from.outline ?? from.cavity, toOutline = to.outline ?? to.cavity;
    if (fromOutline.curves.length !== toOutline.curves.length || from.cavity.curves.length !== to.cavity.curves.length ||
        (from.tongue === null) !== (to.tongue === null) ||
        (from.tongue && to.tongue && from.tongue.curves.length !== to.tongue.curves.length)) {
        throw new RangeError("Incompatible mouth topology: cavity/tongue contours and segment counts must match");
    }
    if (t === 0) return from;
    if (t === 1) return to;
    const point = (a: MouthPoint, b: MouthPoint): MouthPoint => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
    const contour = (a: MouthContour, b: MouthContour): MouthContour => ({
        start: point(a.start, b.start),
        curves: a.curves.map((c, i) => [point(c[0], b.curves[i][0]), point(c[1], b.curves[i][1]), point(c[2], b.curves[i][2])]),
    });
    const result: MouthGeometry = {
        width: lerp(from.width, to.width, t), height: lerp(from.height, to.height, t),
        strokeWidth: lerp(from.strokeWidth, to.strokeWidth, t),
        cavityStrokeWidth: lerp(from.cavityStrokeWidth, to.cavityStrokeWidth, t),
        cavity: contour(from.cavity, to.cavity),
        tongue: from.tongue && to.tongue ? contour(from.tongue, to.tongue) : null,
        ...(from.clipTongue || to.clipTongue ? { clipTongue: true } : {}),
        ...(from.outline || to.outline ? { outline: contour(fromOutline, toOutline) } : {}),
        ...(from.tongueOpacity !== undefined || to.tongueOpacity !== undefined ? { tongueOpacity: lerp(from.tongueOpacity ?? 1, to.tongueOpacity ?? 1, t) } : {}),
    };
    validateMouthGeometry(result);
    return result;
}

/** Placement stays in 800 x 480 logical units; no transform scale is added. */
export function interpolateMouthLayout(from: LayerPosition, to: LayerPosition, progress: number): LayerPosition {
    const t = normalizedProgress(progress);
    for (const position of [from, to]) {
        if (!position || ![position.x, position.y, position.width, position.height].every(Number.isFinite) ||
            position.width <= 0 || position.height <= 0) throw new RangeError("Mouth layout must be finite with positive dimensions");
    }
    return { x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t),
        width: lerp(from.width, to.width, t), height: lerp(from.height, to.height, t) };
}
