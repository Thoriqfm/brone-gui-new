import type { EyeGeometry, EyePoint, EyeCurve } from "../types";
export interface BlinkLid { readonly start: EyePoint; readonly curve: EyeCurve }
export interface IdleBlinkGeometry {
    readonly kind: "idle-blink";
    readonly source: EyeGeometry;
    readonly progress: number;
    readonly upper: BlinkLid;
    readonly lower: BlinkLid;
    readonly aperture: string;
    readonly upperPath: string;
    readonly lowerPath: string;
    readonly interiorVisible: boolean;
}
export type BlinkGeometry = EyeGeometry | IdleBlinkGeometry;


/** Phase 2 adds an independent union; the Phase 1 data contract stays unchanged. */
export interface ExpressionBlinkPreset {
    readonly family: "happier-arch" | "sloping" | "thinking-ellipse";
    readonly upperOpen: BlinkLid;
    readonly lowerOpen: BlinkLid;
    readonly closed: BlinkLid;
    readonly boundary: string;
    readonly stroke: string;
    readonly strokeWidth: number;
    readonly landmarks: {readonly upper: readonly EyePoint[]; readonly lower: EyePoint; readonly shoulders?: readonly EyePoint[]};
}
export interface FamilyBlinkGeometry {
    readonly kind: "expression-blink";
    readonly expression: import("../presets").EyeExpression;
    readonly source: import("../types").LayeredEyeGeometry;
    readonly progress: number;
    readonly upper: BlinkLid;
    readonly lower: BlinkLid;
    readonly aperture: string;
    readonly upperPath: string;
    readonly lowerPath: string;
    readonly interiorVisible: boolean;
}
export type ExpressionBlinkGeometry = BlinkGeometry | import("../types").LayeredEyeGeometry | FamilyBlinkGeometry;
