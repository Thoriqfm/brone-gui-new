import { FACE_LAYER_LAYOUTS } from "../../config/faceLayerLayouts";
import { MOUTH_PRESETS } from "./presets";
import { MOUTH_STYLE, validateMouthGeometry } from "./pathGenerator";
import { interpolateMouthGeometry } from "./geometryInterpolator";
import { alignContours, cornerPosition, type ContourLandmarks } from "./topology";
import type { MouthContour, MouthGeometry } from "./types";

export const MOUTH_EXPRESSIONS = ["idle", "happy", "sad", "cry", "shock", "thinking"] as const;
export type MouthExpression = typeof MOUTH_EXPRESSIONS[number];
export type MouthTarget = Exclude<MouthExpression, "idle">;
export const MOUTH_TARGETS = /* @__PURE__ */ MOUTH_EXPRESSIONS.filter((name): name is MouthTarget => name !== "idle");
export const MOUTH_LABELS: Record<MouthExpression, string> = { idle: "Idle", happy: "Happy", sad: "Sad", cry: "Cry", shock: "Shock", thinking: "Thinking" };
export const MOUTH_EXPRESSION_PRESETS = {
    idle: { geometry: MOUTH_PRESETS.IDLE, layout: FACE_LAYER_LAYOUTS.idle.mouth, style: MOUTH_STYLE },
    happy: { geometry: MOUTH_PRESETS.HAPPY, layout: FACE_LAYER_LAYOUTS.happy.mouth, style: MOUTH_STYLE },
    sad: { geometry: MOUTH_PRESETS.SAD, layout: FACE_LAYER_LAYOUTS.sad.mouth, style: MOUTH_STYLE },
    cry: { geometry: MOUTH_PRESETS.CRY, layout: FACE_LAYER_LAYOUTS.cry.mouth, style: MOUTH_STYLE },
    shock: { geometry: MOUTH_PRESETS.SHOCK, layout: FACE_LAYER_LAYOUTS.shock.mouth, style: MOUTH_STYLE },
    thinking: { geometry: MOUTH_PRESETS.THINKING, layout: FACE_LAYER_LAYOUTS.thinking.mouth, style: MOUTH_STYLE },
} as const;

// Explicit source-asset landmarks. Fractional positions subdivide the original cubic exactly.
function cavityLandmarks(name: MouthExpression, c: MouthContour, outline = false): ContourLandmarks {
    switch (name) {
        case "idle": case "happy": return { anchors: [0.5, cornerPosition(c, 1, false), 3, cornerPosition(c, 4, true)] };
        case "sad": case "cry": return outline
            ? { anchors: [0.5, cornerPosition(c, 1, false), 2.5, cornerPosition(c, 3, true)] }
            : { anchors: [1.5, cornerPosition(c, 0, false), 3.5, cornerPosition(c, 2, true)], reverse: true };
        case "shock": return outline ? { anchors: [0, 3, 2, 1], reverse: true } : { anchors: [1, 2, 3, 0] };
        case "thinking": return { anchors: [1, 0, 3, 2], reverse: true };
    }
}
function tongueLandmarks(name: MouthExpression, c: MouthContour): ContourLandmarks {
    const sad = name === "sad" || name === "cry";
    return { anchors: [0, cornerPosition(c, 1, true), sad ? 3 : 5, cornerPosition(c, sad ? 4 : 8, false)] };
}
function prepare(target: MouthTarget): readonly [MouthGeometry, MouthGeometry] {
    const a = MOUTH_PRESETS.IDLE, b = MOUTH_EXPRESSION_PRESETS[target].geometry;
    // Preserve every existing Idle/Happy intermediate parameter and its 5/10 topology.
    if (target === "happy") return [a, b];
    const [ac, bc] = alignContours(a.cavity, b.cavity, cavityLandmarks("idle", a.cavity), cavityLandmarks(target, b.cavity));
    const [ao, bo] = alignContours(a.cavity, b.outline ?? b.cavity, cavityLandmarks("idle", a.cavity), cavityLandmarks(target, b.outline ?? b.cavity, true));
    let at: MouthContour, bt: MouthContour;
    if (b.tongue) {
        [at, bt] = alignContours(a.tongue!, b.tongue, tongueLandmarks("idle", a.tongue!), tongueLandmarks(target, b.tongue));
    } else {
        at = a.tongue!;
        // Thinking's lower-center landmark, on the original cavity curve.
        const anchor = b.cavity.curves[2][2];
        bt = { start: anchor, curves: at.curves.map(() => [anchor, anchor, anchor]) };
    }
    const from = { ...a, clipTongue: true, cavity: ac, outline: ao, tongue: at };
    const to = { ...b, clipTongue: true, cavity: bc, outline: bo, tongue: bt, ...(b.tongue ? {} : { tongueOpacity: 0 }) };
    validateMouthGeometry(from); validateMouthGeometry(to);
    return [from, to];
}
export const IDLE_MOUTH_TRANSITIONS = /* @__PURE__ */ Object.fromEntries(/* @__PURE__ */ MOUTH_TARGETS.map((target) => [target, prepare(target)])) as Record<MouthTarget, readonly [MouthGeometry, MouthGeometry]>;

/** Original endpoint objects; exact reparameterizations for intermediate frames. */
export function sampleIdleMouthTransition(target: MouthTarget, progress: number): MouthGeometry {
    if (!MOUTH_TARGETS.includes(target)) throw new RangeError("Unsupported mouth target");
    if (!Number.isFinite(progress)) throw new RangeError("Mouth progress must be finite");
    if (progress <= 0) return MOUTH_PRESETS.IDLE;
    if (progress >= 1) return MOUTH_EXPRESSION_PRESETS[target].geometry;
    const [from, to] = IDLE_MOUTH_TRANSITIONS[target];
    return interpolateMouthGeometry(from, to, progress);
}

const directTransitions = new Map<string, readonly [MouthGeometry, MouthGeometry]>();

/** Align source landmarks directly to destination landmarks, without an Idle leg. */
export function sampleMouthTransition(from: MouthExpression, to: MouthExpression, progress: number): MouthGeometry {
    if (!MOUTH_EXPRESSIONS.includes(from) || !MOUTH_EXPRESSIONS.includes(to)) throw new RangeError("Unsupported mouth expression");
    if (!Number.isFinite(progress)) throw new RangeError("Mouth progress must be finite");
    const a = MOUTH_EXPRESSION_PRESETS[from].geometry, b = MOUTH_EXPRESSION_PRESETS[to].geometry;
    if (progress <= 0 || from === to) return a;
    if (progress >= 1) return b;
    // Keep the established Idle routes and all their existing intermediate frames.
    if (from === "idle") return sampleIdleMouthTransition(to as MouthTarget, progress);
    if (to === "idle") return sampleIdleMouthTransition(from, 1 - progress);
    const key = from + ":" + to;
    let pair = directTransitions.get(key);
    if (!pair) {
        const [ac, bc] = alignContours(a.cavity, b.cavity, cavityLandmarks(from, a.cavity), cavityLandmarks(to, b.cavity));
        const ao = a.outline ?? a.cavity, bo = b.outline ?? b.cavity;
        const [outlineA, outlineB] = alignContours(ao, bo, cavityLandmarks(from, ao, true), cavityLandmarks(to, bo, true));
        let at: MouthContour, bt: MouthContour;
        if (a.tongue && b.tongue) {
            [at, bt] = alignContours(a.tongue, b.tongue, tongueLandmarks(from, a.tongue), tongueLandmarks(to, b.tongue));
        } else {
            // Thinking has no tongue: collapse/fade only that contour at its
            // existing lower-center landmark, retaining the other mouth's topology.
            const collapse = (geometry: MouthGeometry, tongue: MouthContour): MouthContour => {
                const anchor = geometry.cavity.curves[2][2];
                return { start: anchor, curves: tongue.curves.map(() => [anchor, anchor, anchor]) };
            };
            at = a.tongue ?? collapse(a, b.tongue!);
            bt = b.tongue ?? collapse(b, a.tongue!);
        }
        pair = [
            { ...a, cavity: ac, outline: outlineA, tongue: at, clipTongue: true, tongueOpacity: a.tongue ? 1 : 0 },
            { ...b, cavity: bc, outline: outlineB, tongue: bt, clipTongue: true, tongueOpacity: b.tongue ? 1 : 0 },
        ];
        pair.forEach(validateMouthGeometry);
        directTransitions.set(key, pair);
        directTransitions.set(to + ":" + from, [pair[1], pair[0]]);
    }
    return interpolateMouthGeometry(pair[0], pair[1], progress);
}
