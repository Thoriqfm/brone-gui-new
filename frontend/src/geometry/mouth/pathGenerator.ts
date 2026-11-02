import type { MouthContour, MouthGeometry, MouthPoint } from "./types";

export const MOUTH_STYLE = Object.freeze({ cavityFill: "#232322", tongueFill: "#EF775D", stroke: "black" });
const positive = (n: number) => Number.isFinite(n) && n > 0;
export function validateMouthContour(value: MouthContour): void {
    const point = (p: MouthPoint) => Array.isArray(p) && p.length === 2 && Array.from(p).every((n) => Number.isFinite(n));
    if (!value || !point(value.start) || value.start.some((n) => n < 0 || n > 1) || !Array.isArray(value.curves) || value.curves.length < 1 || value.curves.length > 32 ||
        !Array.from(value.curves).every((c) => Array.isArray(c) && c.length === 3 && Array.from(c).every(point))) {
        throw new RangeError("Invalid normalized mouth contour");
    }
    const end = value.curves.at(-1)![2];
    if (end.some((n: number, i: number) => Math.abs(n - value.start[i]) > 0.00001)) throw new RangeError("Mouth contour must close");
}
// Exact cubic extrema, rather than control-point bounds (which overestimate the artwork).
function axisBounds(p: number, a: number, b: number, q: number): number[] {
    const A = -p + 3 * a - 3 * b + q, B = 2 * (p - 2 * a + b), C = a - p;
    const roots = Math.abs(A) < 1e-12 ? (Math.abs(B) < 1e-12 ? [] : [-C / B]) :
        B * B - 4 * A * C < 0 ? [] : [(-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A), (-B - Math.sqrt(B * B - 4 * A * C)) / (2 * A)];
    return [p, q, ...roots.filter((t) => t > 0 && t < 1).map((t) =>
        (1 - t) ** 3 * p + 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3 * q)];
}
export function validateMouthGeometry(g: MouthGeometry): void {
    if (!g || ![g.width, g.height, g.strokeWidth, g.cavityStrokeWidth].every(positive) || g.cavityStrokeWidth > g.strokeWidth) {
        throw new RangeError("Mouth dimensions and strokes must be finite, positive and ordered");
    }
    validateMouthContour(g.cavity);
    if (g.tongue !== null) validateMouthContour(g.tongue);
    if (g.outline !== undefined) validateMouthContour(g.outline);
    if (g.clipTongue !== undefined && typeof g.clipTongue !== "boolean") throw new RangeError("Tongue clipping must be boolean");
    if (g.tongueOpacity !== undefined && (!Number.isFinite(g.tongueOpacity) || g.tongueOpacity < 0 || g.tongueOpacity > 1)) throw new RangeError("Tongue opacity must be in [0,1]");
    // Approved paths overshoot the top by <0.007 units at stroke width 8.
    const tolerance = g.strokeWidth * 0.002;
    for (const [contour, stroke] of [[g.cavity, g.outline ? g.cavityStrokeWidth : g.strokeWidth], [g.outline ?? g.cavity, g.strokeWidth]] as const) {
        let previous = contour.start;
        for (const [a, b, end] of contour.curves) {
            for (const axis of [0, 1] as const) {
                const dimension = axis === 0 ? g.width : g.height;
                const values = axisBounds(previous[axis], a[axis], b[axis], end[axis]);
                if (Math.min(...values) * dimension < stroke / 2 - tolerance ||
                    Math.max(...values) * dimension > dimension - stroke / 2 + tolerance) {
                    throw new RangeError("Mouth outline exceeds its viewBox; increase dimensions or reduce stroke");
                }
            }
            previous = end;
        }
    }
}
export function generateMouthPaths(g: MouthGeometry) {
    validateMouthGeometry(g);
    const number = (n: number) => String(Number(n.toPrecision(15)));
    const point = ([x, y]: MouthPoint) => number(x * g.width) + " " + number(y * g.height);
    const path = (c: MouthContour) => "M" + point(c.start) + c.curves.map((curve) => "C" + curve.map(point).join(" ")).join("") + "Z";
    const cavity = path(g.cavity);
    return { width: g.width, height: g.height, viewBox: "0 0 " + number(g.width) + " " + number(g.height),
        cavity, outline: g.outline ? path(g.outline) : cavity, tongue: g.tongue === null ? null : path(g.tongue) };
}
