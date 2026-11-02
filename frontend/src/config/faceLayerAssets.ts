const root = `${import.meta.env.BASE_URL}assets/face-layers/`;
const asset = (path: string, width: number, height: number) => ({
    src: `${root}${path}`, width, height,
});

export const FACE_LAYER_ASSETS = {
    faceBase: asset("base/face-base.svg", 800, 480),
    faceLines: asset("base/face-lines.svg", 1060, 274),
    blushing: asset("effects/blushing.svg", 61, 36),
    blushLine: asset("effects/line-for-blushing.svg", 103, 8),
    cryEffect: asset("effects/cry-effect.svg", 81, 269),
    questionMark: asset("effects/question-mark.svg", 60, 89),
    shockEffect: asset("effects/shock-effect.svg", 77, 88),
    idleLeft: asset("eyes/left/idle-eye-left.svg", 129, 171),
    idleRight: asset("eyes/right/idle-eye-right.svg", 129, 171),
    happierLeft: asset("eyes/left/happier-eye-left.svg", 123, 139),
    happierRight: asset("eyes/right/happier-eye-right.svg", 123, 139),
    transitionLeft: asset("eyes/left/happier-transition-eye-left.svg", 156, 153),
    transitionRight: asset("eyes/right/happier-transition-eye-right.svg", 160, 163),
    sadLeft: asset("eyes/left/sad-eye-left.svg", 142, 156),
    sadRight: asset("eyes/right/sad-eye-right.svg", 142, 156),
    cryLeft: asset("eyes/left/cry-eye-left.svg", 142, 145),
    cryRight: asset("eyes/right/cry-eye-right.svg", 142, 183),
    shockLeft: asset("eyes/left/shock-eye-left.svg", 129, 171),
    shockRight: asset("eyes/right/shock-eye-right.svg", 129, 171),
    thinkingLeft: asset("eyes/left/thinking-eye-left.svg", 142, 145),
    thinkingRight: asset("eyes/right/thinking-eye-right.svg", 129, 171),
    idleMouth: asset("mouth/idle-mouth.svg", 282, 96),
    happierMouth: asset("mouth/happier-mouth.svg", 282, 155),
    sadMouth: asset("mouth/sad-mouth.svg", 276, 86),
    cryMouth: asset("mouth/cry-mouth.svg", 276, 86),
    shockMouth: asset("mouth/shock-mouth.svg", 156, 148),
    thinkingMouth: asset("mouth/thinking-mouth.svg", 271, 52),
} as const;

export type FaceLayerAsset = keyof typeof FACE_LAYER_ASSETS;
export const LAYER_EXPRESSIONS = [
    "idle", "happy", "happier", "happier-transition", "sad", "cry", "shock", "thinking",
] as const;
export type LayerExpression = (typeof LAYER_EXPRESSIONS)[number];

interface Composition {
    leftEye: FaceLayerAsset;
    rightEye: FaceLayerAsset;
    mouth: FaceLayerAsset;
    effects: readonly { id: string; asset: FaceLayerAsset; order: "underEyes" | "effects" }[];
}

// Combinations verified against the corresponding full-image master.
// Both cheek assets already include their pink hatch marks.
export const FACE_LAYER_COMPOSITIONS: Record<LayerExpression, Composition> = {
    idle: { leftEye: "idleLeft", rightEye: "idleRight", mouth: "idleMouth", effects: [] },
    // Happy reuses idle eyes and the happier mouth, matching happy.png.
    happy: { leftEye: "idleLeft", rightEye: "idleRight", mouth: "happierMouth", effects: [] },
    happier: {
        leftEye: "happierLeft", rightEye: "happierRight", mouth: "happierMouth",
        effects: [
            { id: "blushLeft", asset: "blushing", order: "effects" },
            { id: "blushRight", asset: "blushing", order: "effects" },
            { id: "blushLineLeft", asset: "blushLine", order: "effects" },
            { id: "blushLineRight", asset: "blushLine", order: "effects" },
        ],
    },
    // The transition reference has the large happier mouth and no blush.
    "happier-transition": { leftEye: "transitionLeft", rightEye: "transitionRight", mouth: "happierMouth", effects: [] },
    sad: { leftEye: "sadLeft", rightEye: "sadRight", mouth: "sadMouth", effects: [] },
    cry: {
        leftEye: "cryLeft", rightEye: "cryRight", mouth: "cryMouth",
        // Tear strips cover the lower cry-eye outlines.
        effects: [
            { id: "tearLeft", asset: "cryEffect", order: "effects" },
            { id: "tearRight", asset: "cryEffect", order: "effects" },
        ],
    },
    shock: { leftEye: "shockLeft", rightEye: "shockRight", mouth: "shockMouth", effects: [{ id: "mark", asset: "shockEffect", order: "effects" }] },
    thinking: { leftEye: "thinkingLeft", rightEye: "thinkingRight", mouth: "thinkingMouth", effects: [{ id: "mark", asset: "questionMark", order: "effects" }] },
};

