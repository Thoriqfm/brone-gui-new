import type { LayerExpression } from "./faceLayerAssets";

export interface LayerPosition {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface FaceLayerLayout {
    faceBase: LayerPosition;
    faceLines: LayerPosition;
    leftEye: LayerPosition;
    rightEye: LayerPosition;
    mouth: LayerPosition;
    effects: Record<string, LayerPosition>;
}

// Logical 800x480 coordinates measured against original PNG masters.
// Quarter-pixel refinements: scripts/refine-face-layouts.py and
// reports/face-decomposition/coordinate-candidates.json.
// All layers retain intrinsic SVG dimensions and aspect ratios.
const base = {
    faceBase: { x: 0, y: 0, width: 800, height: 480 },
    faceLines: { x: -129.75, y: -4.75, width: 1060, height: 274 },
};

export const FACE_LAYER_ORDER = {
    faceBase: 0, faceLines: 10, underEyes: 15, eyes: 20, mouth: 30, effects: 40,
} as const;

export const FACE_LAYER_LAYOUTS: Record<LayerExpression, FaceLayerLayout> = {
    idle: {
        ...base,
        leftEye: { x: 115, y: 154, width: 129, height: 171 },
        rightEye: { x: 556, y: 154, width: 129, height: 171 },
        mouth: { x: 259.75, y: 325.25, width: 282, height: 96 }, effects: {},
    },
    happy: {
        ...base,
        leftEye: { x: 115, y: 154, width: 129, height: 171 },
        rightEye: { x: 556, y: 154, width: 129, height: 171 },
        mouth: { x: 259.5, y: 287.75, width: 282, height: 155 }, effects: {},
    },
    happier: {
        ...base,
        leftEye: { x: 104, y: 133, width: 123, height: 139 },
        rightEye: { x: 573, y: 133, width: 123, height: 139 },
        mouth: { x: 259.5, y: 287.75, width: 282, height: 155 },
        effects: {
            blushLeft: { x: 135, y: 271.25, width: 61, height: 36 },
            blushRight: { x: 604, y: 271.25, width: 61, height: 36 },
            blushLineLeft: { x: 114, y: 267.5, width: 103, height: 8 },
            blushLineRight: { x: 583, y: 267.5, width: 103, height: 8 },
        },
    },
    "happier-transition": {
        ...base,
        leftEye: { x: 95.5, y: 159.25, width: 156, height: 153 },
        rightEye: { x: 545.5, y: 149.25, width: 160, height: 163 },
        mouth: { x: 259.5, y: 287.75, width: 282, height: 155 }, effects: {},
    },
    sad: {
        ...base,
        leftEye: { x: 104, y: 148, width: 142, height: 156 },
        rightEye: { x: 554.25, y: 148, width: 142, height: 156 },
        mouth: { x: 262, y: 303.5, width: 276, height: 86 }, effects: {},
    },
    cry: {
        ...base,
        leftEye: { x: 104, y: 148, width: 142, height: 145 },
        rightEye: { x: 554.25, y: 148, width: 142, height: 183 },
        mouth: { x: 262, y: 303.5, width: 276, height: 86 },
        effects: {
            // Start below the white highlights (bottom ~225.4). The strips
            // intentionally overflow 16 units into the display's bottom margin.
            tearLeft: { x: 138, y: 227, width: 81, height: 269 },
            tearRight: { x: 581, y: 227, width: 81, height: 269 },
        },
    },
    shock: {
        ...base,
        leftEye: { x: 115, y: 154, width: 129, height: 171 },
        rightEye: { x: 556, y: 154, width: 129, height: 171 },
        mouth: { x: 322.25, y: 304, width: 156, height: 148 },
        effects: { mark: { x: 687, y: 53, width: 77, height: 88 } },
    },
    thinking: {
        ...base,
        leftEye: { x: 102.5, y: 167.5, width: 142, height: 145 },
        rightEye: { x: 560.25, y: 154, width: 129, height: 171 },
        mouth: { x: 265.5, y: 338, width: 271, height: 52 },
        effects: { mark: { x: 700, y: 43.25, width: 60, height: 89 } },
    },
};
