import type { LayerExpression } from "../config/faceLayerAssets";
import { FACE_LAYER_LAYOUTS } from "../config/faceLayerLayouts";

export type EffectPhase = "enter" | "exit";
const clamp = (p: number) => Math.max(0, Math.min(1, p));
const smooth = (p: number) => { const t = clamp(p); return t * t * (3 - 2 * t); };

/** Cry eyes/water settle before tears enter; tears drain before the face exits. */
export function sampleFaceTransitionProgress(from: LayerExpression, to: LayerExpression, progress: number) {
    if (!Number.isFinite(progress)) throw new RangeError("Face progress must be finite");
    const p = clamp(progress);
    return from === "cry" ? clamp((p - .4) / .6) : to === "cry" ? clamp(p / .6) : p;
}

/** Uses the face's progress, so effects never extend the requested duration. */
export function sampleFaceEffectMotion(expression: LayerExpression, phase: EffectPhase, progress: number, other?: LayerExpression) {
    if (!Number.isFinite(progress)) throw new RangeError("Effect progress must be finite");
    const entering = phase === "enter";
    const p = other ? sampleFaceTransitionProgress(entering ? other : expression, entering ? expression : other, progress) : clamp(progress);
    let opacity = entering ? p : 1 - p, scale = 1, y = 0, clipBottom = 0, tearOffsetPercent = 0;
    switch (expression) {
        case "cry":
            opacity = 1;
            // Reveal only after the cry eye (including its water) is complete.
            // On exit the image falls inside a fixed clipping window, then the
            // eyes/mouth change. The strip never retracts upward or fades.
            if (entering) clipBottom = 100 * (1 - smooth((progress - .6) / .4));
            else tearOffsetPercent = 100 * smooth(progress / .4);
            break;
        case "happier": {
            const visible = entering ? smooth((p - .15) / .85) : 1 - smooth(p);
            opacity = visible;
            scale = entering ? .95 + .05 * visible : 1;
            break;
        }
        case "shock":
            if (entering) {
                const t = other === "thinking" ? clamp((p - .45) / .55) : p;
                opacity = smooth(t / .18);
                scale = t < .35 ? .8 + .28 * smooth(t / .35) : 1.08 - .08 * smooth((t - .35) / .65);
            } else {
                opacity = 1 - smooth(p / .4);
                scale = 1 - .06 * smooth(p / .4);
            }
            break;
        case "thinking": {
            // Previous punctuation has disappeared by .4 before '?' appears.
            const visible = entering ? smooth((p - .45) / .55) : 1 - smooth(p / .4);
            opacity = visible;
            y = 5 * (1 - visible);
            break;
        }
    }
    return { opacity, scale, y, clipBottom, tearOffsetPercent };
}

/** Patch effect wrappers only; images/artwork and the face store are untouched. */
export function updateFaceEffectMotion(root: HTMLElement, expression: LayerExpression, phase: EffectPhase, progress: number, other?: LayerExpression) {
    const frame = sampleFaceEffectMotion(expression, phase, progress, other);
    root.style.visibility = "visible";
    for (const node of root.querySelectorAll<HTMLElement>("[data-element-role]")) {
        const id = node.getAttribute("data-element-role")!.replace("effect:", "");
        const layout = FACE_LAYER_LAYOUTS[expression].effects[id];
        if (!layout) continue;
        node.style.opacity = String(frame.opacity);
        node.style.clipPath = expression === "cry" ? `inset(0 0 ${frame.clipBottom}% 0)` : "none";
        node.style.transform = `translateY(${frame.y / layout.height * 100}%) scale(${frame.scale})`;
        node.style.transformOrigin = "center";
        if (expression === "cry") {
            node.querySelector<HTMLElement>("img")!.style.transform = `translateY(${frame.tearOffsetPercent}%)`;
        }
        if (expression === "happier") {
            // Each cheek and its separate black line share one visual pivot.
            const cheek = FACE_LAYER_LAYOUTS.happier.effects[id.endsWith("Left") ? "blushLeft" : "blushRight"];
            node.style.transformOrigin = `${(cheek.x + cheek.width / 2 - layout.x) / layout.width * 100}% ${(cheek.y + cheek.height / 2 - layout.y) / layout.height * 100}%`;
        }
    }
}
