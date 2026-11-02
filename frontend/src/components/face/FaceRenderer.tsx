import { useExpressionTransition } from "../../animation/useExpressionTransition";
import { useFaceStore } from "../../stores/faceStore";
import ExpressionTransitionLayer from "./ExpressionTransitionLayer";
import ElementExpressionLayer from "./ElementExpressionLayer";
import FaceBase from "./FaceBase";
import GeometryTransitionLayer from "./GeometryTransitionLayer";
import type { LayerExpression } from "../../config/faceLayerAssets";
import type { FaceRendererMode } from "../../animation/productionGeometry";
import type { BlinkChannel } from "../../animation/morphBlinkPlayback";

export default function FaceRenderer({ transition = false, renderer = "asset", expression: localExpression, duration: localDuration, blinkChannel }: {
    transition?: boolean; renderer?: FaceRendererMode; expression?: LayerExpression; duration?: number; blinkChannel?: BlinkChannel;
}) {
    const emotion = useFaceStore((s) => s.emotion);
    const duration = useFaceStore((s) => s.transitionMs);
    const expression = transition ? "happier-transition" : localExpression ?? emotion;
    // Mode changes remount only visual ownership; canonical expression state is untouched.
    return <FaceComposition key={renderer+Boolean(blinkChannel)} expression={expression} duration={localDuration ?? duration} transition={transition} renderer={renderer} blinkChannel={blinkChannel} />;
}
function FaceComposition({ expression, duration, transition, renderer, blinkChannel }: {
    expression: LayerExpression; duration: number; transition: boolean; renderer: FaceRendererMode; blinkChannel?: BlinkChannel;
}) {
    const { rootRef, layers, attach, attachFrame, attachElement, prepared } = useExpressionTransition(expression, duration, transition, renderer === "procedural", Boolean(blinkChannel));
    const geometry = layers.length === 2 && layers[1].strategy === "GEOMETRY";
    const elementLayout = renderer === "asset" && (layers.length === 1
        ? layers[0].expression === "idle" || layers[0].expression === "happy"
        : layers[1].strategy === "ELEMENT_BASED");
    return <div className="face-canvas" data-renderer={renderer} data-production-blink={import.meta.env.DEV && blinkChannel?"manual-validation":"disabled"}>
        <div ref={rootRef} className="face-artwork" role="img" aria-label={"Brone " + expression}>
            <FaceBase expression={expression} />
            {geometry ? <GeometryTransitionLayer key={layers[1].id} layers={layers} attach={attach} attachFrame={attachFrame} prepared={prepared} blinkChannel={blinkChannel} /> : elementLayout
                ? <ElementExpressionLayer layers={layers} attachElement={attachElement} prepared={prepared} />
                : layers.map((layer) => <ExpressionTransitionLayer key={layer.id} layer={layer} attach={attach} prepared={prepared} renderer={renderer} blinkChannel={blinkChannel} />)}
        </div>
    </div>;
}
