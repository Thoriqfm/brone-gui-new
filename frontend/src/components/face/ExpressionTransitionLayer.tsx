import { useCallback, useLayoutEffect, useRef } from "react";
import type { TransitionComposition } from "../../animation/expressionTransition";
import Eyes from "./Eyes";
import Mouth from "./Mouth";
import FaceEffects from "./FaceEffects";
import type { FaceRendererMode } from "../../animation/productionGeometry";
import type { BlinkChannel } from "../../animation/morphBlinkPlayback";
import { updateFaceEffectMotion, type EffectPhase } from "../../animation/faceEffectMotion";
import type { LayerExpression } from "../../config/faceLayerAssets";

export default function ExpressionTransitionLayer({ layer, attach, attachFrame, effectPhase, otherExpression, prepared, renderer = "asset", blinkChannel }: {
    layer: TransitionComposition;
    attach: (id: number, element: HTMLDivElement | null) => void;
    attachFrame?: (id: number, frame: ((progress: number) => void) | null) => void;
    effectPhase?: EffectPhase;
    otherExpression?: LayerExpression;
    prepared: (id: number, success: boolean) => void;
    renderer?: FaceRendererMode;
    blinkChannel?: BlinkChannel;
}) {
    const elementRef = useRef<HTMLDivElement | null>(null);
    const effectsRef = useRef<HTMLDivElement>(null);
    const ref = useCallback((element: HTMLDivElement | null) => {
        elementRef.current = element;
        attach(layer.id, element);
    }, [attach, layer.id]);
    useLayoutEffect(() => {
        const element = elementRef.current;
        if (!element) return;
        let stopped = false;
        const images = [...Array.from(element.getElementsByTagName("img")), ...Array.from(effectsRef.current!.getElementsByTagName("img"))];
        void Promise.all(images.map((image) => typeof image.decode === "function" ? image.decode() : Promise.resolve()))
            .then(() => { if (!stopped) prepared(layer.id, true); },
                () => { if (!stopped) prepared(layer.id, false); });
        return () => { stopped = true; };
    }, [layer.id, layer.expression, prepared]);
    useLayoutEffect(() => {
        if (!effectPhase || !attachFrame) return;
        const draw = (p: number) => updateFaceEffectMotion(effectsRef.current!, layer.expression, effectPhase, p, otherExpression);
        draw(0);
        attachFrame(layer.id, draw);
        return () => attachFrame(layer.id, null);
    }, [layer.id, layer.expression, effectPhase, otherExpression, attachFrame]);
    return <><div ref={ref} className="expression-composition"
        data-expression={layer.expression} style={{ opacity: layer.initialOpacity }} aria-hidden="true">
        <Eyes expression={layer.expression} renderer={renderer} blinkChannel={blinkChannel} />
        <Mouth expression={layer.expression} renderer={renderer} />
    </div>
        {/* Outside the opacity-animated composition: tears must never fade. */}
        <div ref={effectsRef} className="geometry-effects" style={{ visibility: effectPhase === "enter" ? "hidden" : "visible" }}>
            <FaceEffects expression={layer.expression} motion resting={!effectPhase} />
        </div>
    </>;
}
