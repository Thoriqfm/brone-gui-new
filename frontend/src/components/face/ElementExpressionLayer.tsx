import { useCallback, useLayoutEffect, useRef } from "react";
import type { TransitionComposition } from "../../animation/expressionTransition";
import type { ElementTarget } from "../../animation/presets/idleToHappy";
import { FACE_LAYER_COMPOSITIONS } from "../../config/faceLayerAssets";
import Eyes from "./Eyes";
import Mouth from "./Mouth";
import FaceEffects from "./FaceEffects";

export default function ElementExpressionLayer({ layers, attachElement, prepared }: {
    layers: readonly TransitionComposition[];
    attachElement: (role: ElementTarget, element: HTMLDivElement | null) => void;
    prepared: (id: number, success: boolean) => void;
}) {
    const root = useRef<HTMLDivElement | null>(null);
    const incoming = layers[layers.length - 1];
    const outgoing = layers.length === 2 ? layers[0] : null;
    const replacingMouth = outgoing && FACE_LAYER_COMPOSITIONS[outgoing.expression].mouth !==
        FACE_LAYER_COMPOSITIONS[incoming.expression].mouth;
    const left = useCallback((node: HTMLDivElement | null) => attachElement("left-eye", node), [attachElement]);
    const right = useCallback((node: HTMLDivElement | null) => attachElement("right-eye", node), [attachElement]);
    const mouth = useCallback((node: HTMLDivElement | null) => attachElement("mouth", node), [attachElement]);
    const oldMouth = useCallback((node: HTMLDivElement | null) => attachElement("mouth-outgoing", node), [attachElement]);
    const effect = useCallback((id: string, node: HTMLDivElement | null) =>
        attachElement(("effect:" + id) as ElementTarget, node), [attachElement]);
    useLayoutEffect(() => {
        if (!root.current) return;
        let stopped = false;
        void Promise.all(Array.from(root.current.getElementsByTagName("img"))
            .map((image) => typeof image.decode === "function" ? image.decode() : Promise.resolve()))
            .then(() => { if (!stopped) prepared(incoming.id, true); },
                () => { if (!stopped) prepared(incoming.id, false); });
        return () => { stopped = true; };
    }, [incoming.id, incoming.expression, prepared]);
    return <div ref={root} className="element-composition" data-expression={incoming.expression} aria-hidden="true">
        <Eyes expression={incoming.expression} leftRef={left} rightRef={right} />
        {replacingMouth && <Mouth key={FACE_LAYER_COMPOSITIONS[outgoing.expression].mouth}
            expression={outgoing.expression} motionRef={oldMouth} motionRole="mouth-outgoing" />}
        <Mouth key={FACE_LAYER_COMPOSITIONS[incoming.expression].mouth} expression={incoming.expression}
            motionRef={mouth} initialOpacity={replacingMouth ? 0 : 1} />
        <FaceEffects expression={incoming.expression} attachEffect={effect} />
    </div>;
}
