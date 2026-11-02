import type { EyeConfiguration, EyeContour, EyeEllipse, EyeGeometry, EyePoint } from "./types";
import { validateLayeredEye } from "./layerGenerator";

function requireValue(condition: unknown, label: string): asserts condition {
    if (!condition) throw new RangeError("Invalid eye geometry: " + label);
}
function finite(value: number, label: string) {
    requireValue(typeof value === "number" && Number.isFinite(value), label);
}
function positive(value: number, label: string) {
    finite(value, label); requireValue(value > 0, label);
}
function unit(value: number, label: string) {
    finite(value, label); requireValue(value >= 0 && value <= 1, label);
}
function tuple(value: readonly number[], length: number, label: string) {
    requireValue(Array.isArray(value) && value.length === length, label);
    for (let i = 0; i < length; i++) finite(value[i], label);
}
function point(value: EyePoint) { tuple(value, 2, "point"); }
function color(value: string) {
    requireValue(typeof value === "string" && /^(?:#[\da-fA-F]{6}|black|white)$/.test(value), "color");
}
function ellipse(value: EyeEllipse) {
    requireValue(value && typeof value === "object", "ellipse");
    point(value.center); point(value.radius);
    value.radius.forEach((n) => positive(n, "ellipse radius"));
}
function contour(value: EyeContour) {
    requireValue(value && typeof value === "object", "contour");
    point(value.start);
    requireValue(Array.isArray(value.curves) && value.curves.length > 0, "curves");
    for (const curve of value.curves) {
        requireValue(Array.isArray(curve) && curve.length === 3, "cubic curve");
        for (let i = 0; i < 3; i++) point(curve[i]);
    }
    const end = value.curves[value.curves.length - 1][2];
    requireValue(end[0] === value.start[0] && end[1] === value.start[1], "closed contour");
}

/** Structural/finite validation, not a self-intersection or containment proof. */
export function validateEyeGeometry(g: EyeConfiguration): void {
    requireValue(g && typeof g === "object", "configuration");
    if ("kind" in g) { validateLayeredEye(g); return; }
    requireValue(g.side === "left" || g.side === "right", "side");
    positive(g.width, "width"); positive(g.height, "height");
    ellipse(g.body); contour(g.outline);
    color(g.stroke); positive(g.strokeWidth, "strokeWidth");
    requireValue(g.gradient && typeof g.gradient === "object", "gradient");
    point(g.gradient.start); point(g.gradient.end);
    requireValue(g.gradient.start.some((n, i) => n !== g.gradient.end[i]), "gradient direction");
    requireValue(Array.isArray(g.gradient.stops) && g.gradient.stops.length >= 2, "gradient stops");
    let last = -1;
    for (const stop of g.gradient.stops) {
        requireValue(stop && typeof stop === "object", "gradient stop");
        unit(stop.offset, "stop offset"); color(stop.color);
        requireValue(stop.offset >= last, "stop order"); last = stop.offset;
    }
    requireValue(g.shadow && typeof g.shadow === "object", "shadow");
    tuple(g.shadow.region, 4, "filter region");
    positive(g.shadow.region[2], "filter width"); positive(g.shadow.region[3], "filter height");
    finite(g.shadow.offsetY, "shadow offset"); finite(g.shadow.blur, "blur");
    requireValue(g.shadow.blur >= 0, "blur"); unit(g.shadow.opacity, "shadow opacity");
    requireValue(g.highlights && typeof g.highlights === "object", "highlights");
    if (g.highlights.ellipse !== null) ellipse(g.highlights.ellipse);
    if (g.highlights.contour !== null) contour(g.highlights.contour);
    color(g.highlights.fill); unit(g.highlights.opacity, "highlight opacity");
}

function path(c: EyeContour): string {
    return `M${c.start.join(" ")}` + c.curves.map((curve) =>
        "C" + curve.map((p) => p.join(" ")).join(" ")).join("") + "Z";
}
export function generateEyePaths(geometry: EyeGeometry) {
    validateEyeGeometry(geometry);
    return {
        viewBox: `0 0 ${geometry.width} ${geometry.height}`,
        outline: path(geometry.outline),
        highlight: geometry.highlights.contour === null ? null : path(geometry.highlights.contour),
    };
}
