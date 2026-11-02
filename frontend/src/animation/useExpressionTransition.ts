import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { LayerExpression } from "../config/faceLayerAssets";
import { createExpressionTransition, type TransitionComposition } from "./expressionTransition";
import type { ElementTarget } from "./presets/idleToHappy";
import { useAnimationEngine } from "./useAnimationEngine";

export function useExpressionTransition(expression: LayerExpression, duration: number, preview: boolean, procedural = false, continuous = false) {
    const [layers, setLayers] = useState<readonly TransitionComposition[]>(() => [
        { id: 0, expression, initialOpacity: 1 },
    ]);
    const coordinator = useRef<ReturnType<typeof createExpressionTransition> | null>(null);
    const nodes = useRef(new Map<number, HTMLDivElement>());
    const frames = useRef(new Map<number, (progress: number) => void>());
    const elementNodes = useRef(new Map<ElementTarget, HTMLDivElement>());
    const reducedMotion = useRef(false);
    const previousPreview = useRef(preview);
    const latest = useRef({ expression, duration, preview });
    latest.current = { expression, duration, preview };
    const { rootRef } = useAnimationEngine((engine) => {
        const current = coordinator.current;
        current?.connect(engine);
        return () => current?.dispose();
    });
    const attach = useCallback((id: number, element: HTMLDivElement | null) => {
        if (element) nodes.current.set(id, element);
        else nodes.current.delete(id);
        coordinator.current?.attach(id, element);
    }, []);
    const attachFrame = useCallback((id: number, frame: ((progress: number) => void) | null) => {
        if (frame) frames.current.set(id, frame);
        else frames.current.delete(id);
        coordinator.current?.attachFrame(id, frame);
    }, []);

    const attachElement = useCallback((role: ElementTarget, element: HTMLDivElement | null) => {
        if (element) elementNodes.current.set(role, element);
        else elementNodes.current.delete(role);
        coordinator.current?.attachElement(role, element);
    }, []);
    const prepared = useCallback((id: number, success: boolean) => {
        coordinator.current?.prepared(id, success);
    }, []);

    useLayoutEffect(() => {
        const current = createExpressionTransition(layers[0], setLayers, procedural, continuous);
        coordinator.current = current;
        for (const [id, element] of nodes.current) current.attach(id, element);
        for (const [id, frame] of frames.current) current.attachFrame(id, frame);
        for (const [role, element] of elementNodes.current) current.attachElement(role, element);
        const media = typeof window.matchMedia === "function"
            ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
        reducedMotion.current = media?.matches ?? false;
        const onMotionChange = () => {
            reducedMotion.current = media?.matches ?? false;
            if (reducedMotion.current) current.request(latest.current.expression, 0, true);
        };
        media?.addEventListener("change", onMotionChange);
        return () => {
            media?.removeEventListener("change", onMotionChange);
            current.dispose();
            if (coordinator.current === current) coordinator.current = null;
        };
    }, []);
    useLayoutEffect(() => {
        coordinator.current?.request(expression, duration,
            reducedMotion.current || preview || previousPreview.current);
        previousPreview.current = preview;
    }, [expression, duration, preview]);
    useLayoutEffect(() => { coordinator.current?.commit(); }, [layers]);
    return { rootRef, layers, attach, attachFrame, attachElement, prepared };
}
