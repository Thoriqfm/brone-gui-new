export { generateBlinkGeometry } from "./blinkGeometry";
export { blinkProgress } from "./blinkInterpolator";
export type { BlinkGeometry, IdleBlinkGeometry, BlinkLid } from "./types";

export { generateExpressionBlinkGeometry } from "./expressionBlinkGeometry";
export { prepareExpressionBlink } from "./expressionBlinkPresets";
export type { ExpressionBlinkGeometry, ExpressionBlinkPreset, FamilyBlinkGeometry } from "./types";
export { generateMorphAwareBlinkGeometry, MORPH_BLINK_PAIRS, eyeBlinkBoundary } from "./morphBlinkAdapter";
export type { MorphBlinkContext, MorphBlinkGeometry, MorphAwareBlinkGeometry } from "./morphBlinkAdapter";
