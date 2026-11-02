import { FACE_LAYER_LAYOUTS, FACE_LAYER_ORDER } from "../../config/faceLayerLayouts";
import type { LayerExpression } from "../../config/faceLayerAssets";
import FaceLayer from "./FaceLayer";

export default function FaceBase({ expression }: { expression: LayerExpression }) {
    const layout = FACE_LAYER_LAYOUTS[expression];
    return <>
        <FaceLayer asset="faceBase" position={layout.faceBase} order={FACE_LAYER_ORDER.faceBase} />
        {/* The source line layer intentionally extends beyond the master canvas. */}
        <div className="face-lines-window" style={{ zIndex: FACE_LAYER_ORDER.faceLines }}>
            <FaceLayer asset="faceLines" position={layout.faceLines} order={0} />
        </div>
    </>;
}
