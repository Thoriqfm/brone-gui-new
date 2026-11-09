import type { LayerExpression } from "../config/faceLayerAssets";
import { supportsProductionMorph } from "./productionGeometry";

export type TransitionStrategy = "ELEMENT_BASED" | "CROSSFADE" | "IMMEDIATE" | "GEOMETRY";
export function selectTransitionStrategy(from: LayerExpression, to: LayerExpression,
    duration: number, immediate = false, procedural = false): TransitionStrategy {
    if (immediate || duration === 0) return "IMMEDIATE";
    if ((from === "happier-transition" || to === "happier-transition") && supportsProductionMorph(from, to)) return "GEOMETRY";
    if ((from === "timeout" || to === "timeout") && supportsProductionMorph(from, to)) return "GEOMETRY";
    if (procedural) return supportsProductionMorph(from, to) ? "GEOMETRY" : "CROSSFADE";
    return from === "idle" && to === "happy" ? "ELEMENT_BASED" : "CROSSFADE";
}
