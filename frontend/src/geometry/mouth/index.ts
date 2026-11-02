export type { MouthPoint, MouthCurve, MouthContour, MouthGeometry } from "./types";
export { MOUTH_PRESETS } from "./presets";
export { generateMouthPaths, validateMouthGeometry, MOUTH_STYLE } from "./pathGenerator";
export { interpolateMouthGeometry, interpolateMouthLayout } from "./geometryInterpolator";
export { subdivideCubic, reverseContour, alignContours, cornerPosition } from "./topology";
export { MOUTH_EXPRESSIONS, MOUTH_TARGETS, MOUTH_LABELS, MOUTH_EXPRESSION_PRESETS, IDLE_MOUTH_TRANSITIONS, sampleIdleMouthTransition } from "./expressionPresets";
export type { MouthExpression, MouthTarget } from "./expressionPresets";
