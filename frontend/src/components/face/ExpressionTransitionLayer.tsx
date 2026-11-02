import { useCallback, useLayoutEffect, useRef } from "react";
import type { TransitionComposition } from "../../animation/expressionTransition";
import Eyes from "./Eyes";
import Mouth from "./Mouth";
import FaceEffects from "./FaceEffects";
import type { FaceRendererMode } from "../../animation/productionGeometry";
import type { BlinkChannel } from "../../animation/morphBlinkPlayback";

export default function ExpressionTransitionLayer({ layer, attach, prepared, renderer = "asset", blinkChannel }: {
    layer: TransitionComposition;
    attach: (id: number, element: HTMLDivElement | null) => void;
    prepared: (id: number, success: boolean) => void;
    renderer?: FaceRendererMode;
    blinkChannel?: BlinkChannel;
}) {
    const elementRef = useRef<HTMLDivElement | null>(null);
    const ref = useCallback((element: HTMLDivElement | null) => {
        elementRef.current = element;
        attach(layer.id, element);
    }, [attach, layer.id]);
    useLayoutEffect(() => {
        const element = elementRef.current;
        if (!element) return;
        let stopped = false;
        const images = Array.from(element.getElementsByTagName("img"));
        void Promise.all(images.map((image) => typeof image.decode === "function" ? image.decode() : Promise.resolve()))
            .then(() => { if (!stopped) prepared(layer.id, true); },
                () => { if (!stopped) prepared(layer.id, false); });
        return () => { stopped = true; };
    }, [layer.id, layer.expression, prepared]);
    return <div ref={ref} className="expression-composition"
        data-expression={layer.expression} style={{ opacity: layer.initialOpacity }} aria-hidden="true">
        <Eyes expression={layer.expression} renderer={renderer} blinkChannel={blinkChannel} />
        <Mouth expression={layer.expression} renderer={renderer} />
        <FaceEffects expression={layer.expression} />
    </div>;
}
