import type { RefCallback } from "react";
import { FACE_LAYER_COMPOSITIONS, type LayerExpression } from "../../config/faceLayerAssets";
import { FACE_LAYER_LAYOUTS, FACE_LAYER_ORDER } from "../../config/faceLayerLayouts";
import FaceLayer from "./FaceLayer";
import ProceduralMouth from "./mouth/ProceduralMouth";
import { canonicalProductionGeometry, isGeometryEmotion, type FaceRendererMode, type ProductionGeometrySample } from "../../animation/productionGeometry";

export default function Mouth({ expression, motionRef, motionRole = "mouth", initialOpacity = 1, renderer = "asset", sample }: { expression: LayerExpression;
    motionRef?: RefCallback<HTMLDivElement>; motionRole?: string; initialOpacity?: number;
    renderer?: FaceRendererMode; sample?: ProductionGeometrySample }) {
    if (isGeometryEmotion(expression) && ((renderer === "procedural" && expression !== "timeout") || sample)) {
        const frame = sample ?? canonicalProductionGeometry(expression), position = frame.layout.mouth;
        return <div ref={motionRef} className="face-layer procedural-mouth" data-geometry-mouth={expression} style={{
            left: position.x / 800 * 100 + "%", top: position.y / 480 * 100 + "%",
            width: position.width / 800 * 100 + "%", height: position.height / 480 * 100 + "%",
            zIndex: FACE_LAYER_ORDER.mouth, opacity: initialOpacity,
        }}><ProceduralMouth geometry={frame.mouth} /></div>;
    }
    return <FaceLayer motionRef={motionRef} motionRole={motionRole} initialOpacity={initialOpacity}
        asset={FACE_LAYER_COMPOSITIONS[expression].mouth}
        position={FACE_LAYER_LAYOUTS[expression].mouth}
        order={FACE_LAYER_ORDER.mouth}
    />;
}
