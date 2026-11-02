import type { BlinkLid } from "./types";
export function blinkProgress(value: number): number {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new RangeError("Invalid blink progress");
    return Math.max(0, Math.min(1, value));
}
/** Both lids share x(t), so their nonnegative vertical gap proves no crossing. */
export function interpolateBlinkLid(open: BlinkLid, closed: BlinkLid, p: number): BlinkLid {
    const t = blinkProgress(p);
    const point = (a: readonly [number, number], b: readonly [number, number]): readonly [number, number] =>
        [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    return { start: point(open.start, closed.start), curve: [point(open.curve[0], closed.curve[0]),
        point(open.curve[1], closed.curve[1]), point(open.curve[2], closed.curve[2])] };
}
