import { useCallback } from "react";
import { FACE_LAYER_COMPOSITIONS, type LayerExpression } from "../../config/faceLayerAssets";
import { FACE_LAYER_LAYOUTS, FACE_LAYER_ORDER } from "../../config/faceLayerLayouts";
import FaceLayer from "./FaceLayer";

type AttachEffect = (id: string, element: HTMLDivElement | null) => void;
function Effect({ expression, id, attach }: { expression: LayerExpression; id: string; attach?: AttachEffect }) {
    const effect = FACE_LAYER_COMPOSITIONS[expression].effects.find((item) => item.id === id)!;
    const ref = useCallback((element: HTMLDivElement | null) => attach?.(id, element), [attach, id]);
    return <FaceLayer asset={effect.asset} position={FACE_LAYER_LAYOUTS[expression].effects[id]}
        order={FACE_LAYER_ORDER[effect.order]} motionRef={attach ? ref : undefined} motionRole={"effect:" + id} />;
}
export default function FaceEffects({ expression, attachEffect }: { expression: LayerExpression; attachEffect?: AttachEffect }) {
    return FACE_LAYER_COMPOSITIONS[expression].effects.map((effect) =>
        <Effect key={effect.id} expression={expression} id={effect.id} attach={attachEffect} />);
}
