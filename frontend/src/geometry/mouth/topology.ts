import type { MouthContour, MouthCurve, MouthPoint } from "./types";
import { validateMouthContour } from "./pathGenerator";

const mix = (a: MouthPoint, b: MouthPoint, t: number): MouthPoint => [a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t];
/** Exact De Casteljau split; coordinates stay in the caller's coordinate system. */
export function subdivideCubic(start: MouthPoint, curve: MouthCurve, t: number): readonly [MouthCurve, MouthCurve] {
    if (!Number.isFinite(t) || t <= 0 || t >= 1) throw new RangeError("Subdivision parameter must be strictly between 0 and 1");
    if (!Array.isArray(curve) || curve.length !== 3 || !Array.from(curve).every((p) => Array.isArray(p))) throw new RangeError("Cubic curve must contain three control/end points");
    if (![start, ...curve].every((p) => Array.isArray(p) && p.length === 2 && Array.from(p).every(Number.isFinite))) throw new RangeError("Cubic points must be finite pairs");
    const [a, b, end] = curve;
    const pa = mix(start, a, t), ab = mix(a, b, t), be = mix(b, end, t);
    const left = mix(pa, ab, t), right = mix(ab, be, t), middle = mix(left, right, t);
    return [[pa, left, middle], [right, be, end]];
}
function slice(start: MouthPoint, curve: MouthCurve, a: number, b: number): { start: MouthPoint; curve: MouthCurve } {
    const prefix = b < 1 ? subdivideCubic(start, curve, b)[0] : curve;
    if (a === 0) return { start, curve: prefix };
    const [left, right] = subdivideCubic(start, prefix, a / b);
    return { start: left[2], curve: right };
}
export function reverseContour(c: MouthContour): MouthContour {
    validateMouthContour(c);
    const starts = [c.start, ...c.curves.slice(0, -1).map((curve) => curve[2])];
    return { start: c.start, curves: c.curves.map(([a, b], i): MouthCurve => [b, a, starts[i]]).reverse() };
}
/** Return the exact x-extremum on an explicitly inspected corner segment. */
export function cornerPosition(c: MouthContour, index: number, maximum: boolean): number {
    validateMouthContour(c);
    if (!Number.isInteger(index) || index < 0 || index >= c.curves.length) throw new RangeError("Corner segment index outside contour");
    const p = index === 0 ? c.start : c.curves[index - 1][2];
    const [a, b, q] = c.curves[index];
    const A = -p[0] + 3 * a[0] - 3 * b[0] + q[0], B = 2 * (p[0] - 2 * a[0] + b[0]), C = a[0] - p[0];
    const roots = Math.abs(A) < 1e-14 ? Math.abs(B) < 1e-14 ? [] : [-C / B] : B * B - 4 * A * C < 0 ? [] : [(-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A), (-B - Math.sqrt(B * B - 4 * A * C)) / (2 * A)];
    const x = (t: number) => (1-t)**3*p[0] + 3*(1-t)**2*t*a[0] + 3*(1-t)*t*t*b[0] + t**3*q[0];
    const candidates = [0, ...roots.filter((t) => t > 0 && t < 1), 1];
    const best = candidates.reduce((best, t) => (maximum ? x(t) > x(best) : x(t) < x(best)) ? t : best, 0);
    return index + best;
}
export interface ContourLandmarks {
    /** Segment-index + local t: top, left, bottom, right (cavity/outline), or top, right, bottom, left (tongue). */
    readonly anchors: readonly [number, number, number, number];
    readonly reverse?: boolean;
}
function sections(original: MouthContour, landmarks: ContourLandmarks): MouthContour[] {
    validateMouthContour(original);
    const n = original.curves.length;
    const c = landmarks.reverse ? reverseContour(original) : original;
    const anchors = landmarks.anchors.map((position) => {
        if (!Number.isFinite(position) || position < 0 || position >= n) throw new RangeError("Landmark outside contour");
        return landmarks.reverse ? (n - position) % n : position;
    });
    const result: MouthContour[] = [];
    let traversed = 0;
    for (let i = 0; i < 4; i++) {
        const begin = anchors[i];
        let end = anchors[(i + 1) % 4];
        if (end <= begin) end += n;
        traversed += end - begin;
        const curves: MouthCurve[] = [];
        let start: MouthPoint | undefined;
        for (let position = begin; position < end - 1e-12;) {
            const integer = Math.floor(position), index = integer % n;
            const stop = Math.min(integer + 1, end);
            const part = slice(index === 0 ? c.start : c.curves[index - 1][2], c.curves[index], position - integer, stop - integer);
            start ??= part.start;
            curves.push(part.curve);
            position = stop;
        }
        result.push({ start: start!, curves });
    }
    if (Math.abs(traversed - n) > 1e-9) throw new RangeError("Landmarks must traverse the contour exactly once in order");
    return result;
}
// Arc length is used only to choose correspondence parameters. Every output cubic
// is still an exact De Casteljau subdivision of its source, never a fitted curve.
function arcLength(p: MouthPoint, [a, b, q]: MouthCurve, end = 1): number {
    const speed = (t: number) => Math.hypot(...[0, 1].map((axis) =>
        3*(1-t)**2*(a[axis]-p[axis]) + 6*(1-t)*t*(b[axis]-a[axis]) + 3*t*t*(q[axis]-b[axis])));
    const steps = 64, h = end / steps;
    let sum = speed(0) + speed(end);
    for (let i = 1; i < steps; i++) sum += (i % 2 ? 4 : 2) * speed(i * h);
    return sum * h / 3;
}
function metric(c: MouthContour) {
    const starts = [c.start, ...c.curves.slice(0, -1).map((curve) => curve[2])];
    const lengths = c.curves.map((curve, i) => arcLength(starts[i], curve));
    const cumulative = [0];
    for (const length of lengths) cumulative.push(cumulative.at(-1)! + length);
    const total = cumulative.at(-1)!;
    if (lengths.some((length) => length <= 1e-12)) throw new RangeError("Cannot align a degenerate landmark sector");
    return { starts, lengths, cumulative, total, knots: cumulative.map((length) => length / total) };
}
/** Union of per-sector arc-distance knots, bounded by m+n-1 pieces; no LCM. */
export function alignContours(a: MouthContour, b: MouthContour, aLandmarks: ContourLandmarks, bLandmarks: ContourLandmarks): readonly [MouthContour, MouthContour] {
    const aa = sections(a, aLandmarks), bb = sections(b, bLandmarks);
    const refine = (c: MouthContour, m: ReturnType<typeof metric>, knots: number[]): MouthCurve[] => knots.slice(0, -1).map((begin, i) => {
        const end = knots[i + 1], middle = (begin + end) / 2 * m.total;
        const index = m.cumulative.findIndex((length, j) => j < c.curves.length && middle >= length && middle < m.cumulative[j + 1]);
        const parameter = (fraction: number) => {
            const distance = fraction * m.total - m.cumulative[index];
            if (distance <= 1e-12) return 0;
            if (distance >= m.lengths[index] - 1e-12) return 1;
            let low = 0, high = 1;
            for (let iteration = 0; iteration < 36; iteration++) {
                const t = (low + high) / 2;
                if (arcLength(m.starts[index], c.curves[index], t) < distance) low = t; else high = t;
            }
            return (low + high) / 2;
        };
        return slice(m.starts[index], c.curves[index], parameter(begin), parameter(end)).curve;
    });
    const left: MouthCurve[] = [], right: MouthCurve[] = [];
    for (let i = 0; i < 4; i++) {
        const am = metric(aa[i]), bm = metric(bb[i]);
        const knots = [...new Set([...am.knots, ...bm.knots])].sort((x, y) => x - y).filter((value, i, all) => i === 0 || value - all[i - 1] > 1e-10);
        left.push(...refine(aa[i], am, knots)); right.push(...refine(bb[i], bm, knots));
    }
    const result = [{ start: aa[0].start, curves: left }, { start: bb[0].start, curves: right }] as const;
    result.forEach(validateMouthContour);
    return result;
}
