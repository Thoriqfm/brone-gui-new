import type { RefCallback } from "react";
import { FACE_LAYER_COMPOSITIONS, type LayerExpression } from "../../config/faceLayerAssets";
import { FACE_LAYER_LAYOUTS, FACE_LAYER_ORDER } from "../../config/faceLayerLayouts";
import FaceLayer from "./FaceLayer";
import ProceduralEye from "./eyes/ProceduralEye";
import { canonicalProductionGeometry, type FaceRendererMode, type ProductionGeometrySample } from "../../animation/productionGeometry";
import MorphBlinkEye from "./eyes/MorphBlinkEye";
import type { BlinkChannel } from "../../animation/morphBlinkPlayback";
import type { MorphBlinkContext } from "../../geometry/eyes/blink/morphBlinkAdapter";

export default function Eyes({ expression, leftRef, rightRef, renderer = "asset", sample, blinkChannel, blinkContext }: { expression: LayerExpression;
    leftRef?: RefCallback<HTMLDivElement>; rightRef?: RefCallback<HTMLDivElement>;
    renderer?: FaceRendererMode; sample?: ProductionGeometrySample; blinkChannel?: BlinkChannel;
    blinkContext?: Pick<MorphBlinkContext,"from"|"to"|"morphProgress"> }) {
    if (renderer === "procedural" && expression !== "happier-transition") {
        const frame = sample ?? canonicalProductionGeometry(expression);
        return <>{(["left", "right"] as const).map((side) => {
            const position = frame.layout[side === "left" ? "leftEye" : "rightEye"];
            return <div key={side} ref={side === "left" ? leftRef : rightRef}
                className="face-layer procedural-eye" data-geometry-eye={side} style={{
                    left: position.x / 800 * 100 + "%", top: position.y / 480 * 100 + "%",
                    width: position.width / 800 * 100 + "%", height: position.height / 480 * 100 + "%",
                    zIndex: FACE_LAYER_ORDER.eyes,
                }}>{blinkChannel ? <MorphBlinkEye channel={blinkChannel} context={{
                    ...(blinkContext ?? {from:expression,to:expression,morphProgress:0}),side,blinkProgress:blinkChannel.progress,current:frame.eyes[side],
                }}/> : <ProceduralEye geometry={frame.eyes[side]} />}</div>;
        })}</>;
    }
    const assets = FACE_LAYER_COMPOSITIONS[expression];
    const layout = FACE_LAYER_LAYOUTS[expression];
    return <>
        <FaceLayer motionRef={leftRef} motionRole="left-eye" asset={assets.leftEye} position={layout.leftEye} order={FACE_LAYER_ORDER.eyes} />
        <FaceLayer motionRef={rightRef} motionRole="right-eye" asset={assets.rightEye} position={layout.rightEye} order={FACE_LAYER_ORDER.eyes} />
    </>;
}
