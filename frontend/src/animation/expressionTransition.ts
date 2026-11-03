import type { LayerExpression } from "../config/faceLayerAssets";
import type { AnimationEngine } from "./animationEngine";
import { idleToHappy, type ElementTarget } from "./presets/idleToHappy";
import { selectTransitionStrategy, type TransitionStrategy } from "./transitionStrategy";
import { sampleFaceTransitionProgress } from "./faceEffectMotion";

export interface TransitionComposition {
    id: number;
    expression: LayerExpression;
    initialOpacity: 0 | 1;
    strategy?: TransitionStrategy;
    timeoutRotation?: { left: number; right: number };
}
interface MountedComposition {
    element: HTMLDivElement;
    unregister?: () => void;
    prepared: boolean;
}

// Visual composition bookkeeping only. The existing engine owns every animation.
export function createExpressionTransition(
    initial: TransitionComposition,
    publish: (layers: readonly TransitionComposition[]) => void,
    procedural = false,
    continuous = false,
) {
    let layers: readonly TransitionComposition[] = [initial];
    let nextId = initial.id + 1;
    let engine: AnimationEngine | null = null;
    let generation = 0;
    let pending: { generation: number; duration: number; started: boolean; strategy: TransitionStrategy; prepared: boolean } | null = null;
    let disposed = false;
    let queued: {expression: LayerExpression;duration:number} | null = null;
    const mounted = new Map<number, MountedComposition>();
    const frames = new Map<number, (progress: number) => void>();
    function attachFrame(id: number, frame: ((progress: number) => void) | null): void {
        if (frame) frames.set(id, frame);
        else frames.delete(id);
    }
    const elements = new Map<ElementTarget, MountedComposition>();
    const elementName = (role: ElementTarget) => "expression-element-" + role;
    const name = (id: number) => "expression-composition-" + id;

    function attach(id: number, element: HTMLDivElement | null): void {
        const old = mounted.get(id);
        if (old?.element === element) return;
        old?.unregister?.();
        mounted.delete(id);
        if (disposed || !element || !layers.some((layer) => layer.id === id)) return;
        const target: MountedComposition = { element, prepared: false };
        mounted.set(id, target);
        if (engine) target.unregister = engine.registerTarget(name(id), element);
    }
    function attachElement(role: ElementTarget, element: HTMLDivElement | null): void {
        const old = elements.get(role);
        if (old?.element === element) return;
        old?.unregister?.();
        elements.delete(role);
        if (disposed || !element) return;
        const target: MountedComposition = { element, prepared: true };
        elements.set(role, target);
        if (engine) target.unregister = engine.registerTarget(elementName(role), element);
    }
    function resetElements(keepRegistered: boolean): void {
        for (const [role, target] of elements) {
            target.unregister?.();
            target.unregister = undefined;
            target.element.style.transform = "";
            // Revert restores the original transform; opacity also needs the
            // settled endpoint because the incoming mouth initially mounts at 0.
            if (role === "mouth") target.element.style.opacity = "1";
            if (role === "mouth-outgoing") target.element.style.opacity = "0";
            if (keepRegistered && engine && target.element.isConnected) {
                target.unregister = engine.registerTarget(elementName(role), target.element);
            }
        }
    }
    function stop(): void {
        generation++;
        pending = null;
        for (const id of mounted.keys()) engine?.cancel(name(id));
        resetElements(true);
    }
    function request(expression: LayerExpression, duration: number, immediate = false): void {
        if (disposed) return;
        const last = layers[layers.length - 1];
        // Manual blink validation preserves the displayed morph on replacement.
        // Finish its approved leg, then consume only the latest request. The
        // default (non-blink) interruption policy is deliberately unchanged.
        if (continuous && pending?.strategy === "GEOMETRY" && !immediate && duration>0) {
            queued=expression===last.expression?null:{expression,duration};
            return;
        }
        queued=null;
        if (last.expression === expression && (layers.length === 1 || (!immediate && duration !== 0))) return;
        const interruptedElements = pending?.strategy === "ELEMENT_BASED";
        const interruptedGeometry = pending?.strategy === "GEOMETRY";
        // Only canonical endpoints have approved correspondence. Settle the old
        // target on interruption before starting a new supported branch.
        if (interruptedGeometry) frames.get(last.id)?.(1);
        stop();
        if (interruptedElements || interruptedGeometry) layers = [{ ...last, initialOpacity: 1, strategy: undefined }];
        if (!engine || selectTransitionStrategy(last.expression, expression, duration, immediate, procedural) === "IMMEDIATE") {
            layers = [{ id: nextId++, expression, initialOpacity: 1 }];
        } else {
            // Bound interruption to two compositions. Retain the more visible
            // endpoint (incoming wins a tie), then start the newest crossfade.
            const opacity = (layer: TransitionComposition) =>
                Number(mounted.get(layer.id)?.element.style.opacity ?? layer.initialOpacity);
            const outgoing = layers.reduce((a, b) => opacity(b) >= opacity(a) ? b : a);
            // Carry the visible spiral phase into the new geometry surface.
            // Snapshot before React replaces the outgoing asset composition.
            const angle = (side: "left" | "right") => {
                const image = mounted.get(outgoing.id)?.element.querySelector?.(`[data-layer="timeout${side === "left" ? "Left" : "Right"}"]`);
                if (!image || typeof getComputedStyle !== "function") return 0;
                const values = getComputedStyle(image).transform.match(/^matrix\(([^)]+)\)$/)?.[1].split(",").map(Number);
                return values ? Math.atan2(values[1], values[0]) * 180 / Math.PI : 0;
            };
            const timeoutRotation = outgoing.expression === "timeout" ? { left: angle("left"), right: angle("right") } : undefined;
            if (outgoing.expression === expression) {
                layers = [{ id: nextId++, expression, initialOpacity: 1 }];
            } else {
                const retained = mounted.get(outgoing.id);
                if (retained) retained.element.style.opacity = "1";
                layers = [
                    { ...outgoing, initialOpacity: 1, timeoutRotation },
                    { id: nextId++, expression, initialOpacity: 0,
                        strategy: selectTransitionStrategy(outgoing.expression, expression, duration, false, procedural) },
                ];
                pending = { generation, duration, started: false, prepared: false,
                    strategy: layers[1].strategy! };
            }
        }
        publish(layers);
    }
    function commit(): void {
        const transition = pending;
        if (disposed || !engine || !transition || transition.started || layers.length !== 2) return;
        if (transition.strategy === "GEOMETRY") {
            const incoming = layers[1], target = mounted.get(incoming.id), frame = frames.get(incoming.id);
            if (!target?.element.isConnected || !target.prepared || !frame) return;
            transition.started = true;
            try {
                target.unregister?.();
                target.element.setAttribute("data-progress", "0");
                target.unregister = engine.registerTarget(name(incoming.id), target.element);
                frame(0);
                if (!engine.start(name(incoming.id), {
                    "data-progress": [0, 1], duration: transition.duration, ease: "linear",
                    onUpdate: () => frame(Number(target.element.getAttribute("data-progress"))),
                    onComplete: () => {
                        if (disposed || pending !== transition || generation !== transition.generation) return;
                        frame(1);
                        pending = null;
                        layers = [{ ...incoming, initialOpacity: 1, strategy: undefined }];
                        publish(layers);
                        const next=queued; queued=null;
                        if (next) request(next.expression,next.duration);
                    },
                })) throw new Error("Geometry transition target is unavailable");
            } catch (error) {
                request(incoming.expression, 0, true);
                console.error("Geometry transition failed", error);
            }
            return;
        }
        if (transition.strategy === "ELEMENT_BASED") {
            const recipe = idleToHappy(transition.duration);
            if (!transition.prepared || !recipe.every((entry) => elements.get(entry.target)?.element.isConnected)) return;
            transition.started = true;
            const incoming = layers[1];
            let completed = 0;
            try {
                resetElements(true);
                elements.get("mouth")!.element.style.opacity = "0";
                elements.get("mouth-outgoing")!.element.style.opacity = "1";
                for (const entry of recipe) {
                    if (!engine.start(elementName(entry.target), { ...entry.parameters, onComplete: () => {
                        if (disposed || pending !== transition || generation !== transition.generation) return;
                        if (++completed !== recipe.length) return;
                        pending = null;
                        resetElements(true);
                        layers = [{ ...incoming, initialOpacity: 1, strategy: undefined }];
                        publish(layers);
                    } })) throw new Error("Expression element target is unavailable");
                }
            } catch (error) {
                request(incoming.expression, 0, true);
                console.error("Element transition failed", error);
            }
            return;
        }
        if (!layers.every((layer) => mounted.get(layer.id)?.element.isConnected)) return;
        if (!mounted.get(layers[1].id)?.prepared) return;
        transition.started = true;
        const [outgoing, incoming] = layers;
        let completed = 0;
        const finish = () => {
            if (disposed || pending !== transition || generation !== transition.generation) return;
            if (++completed !== 2) return;
            pending = null;
            // Keep the incoming node and its final engine-owned opacity intact.
            layers = [incoming];
            publish(layers);
        };
        try {
            for (const layer of layers) {
                const target = mounted.get(layer.id)!;
                // Refresh ownership at transition boundaries to bound undo history.
                target.unregister?.();
                target.element.style.opacity = String(layer.initialOpacity);
                target.unregister = engine.registerTarget(name(layer.id), target.element);
            }
            for (const layer of [outgoing, incoming]) {
                const target = mounted.get(layer.id)!;
                const stagedCry = outgoing.expression === "cry" || incoming.expression === "cry";
                if (stagedCry) target.element.setAttribute("data-progress", "0");
                const draw = (p: number) => {
                    if (stagedCry) {
                        const faceProgress = sampleFaceTransitionProgress(outgoing.expression, incoming.expression, p);
                        target.element.style.opacity = String(layer.id === outgoing.id ? 1 - faceProgress : faceProgress);
                    }
                    frames.get(layer.id)?.(p);
                };
                draw(0);
                if (!engine.start(name(layer.id), {
                    ...(stagedCry ? { "data-progress": [0, 1] } : { opacity: layer.id === outgoing.id ? [1, 0] : [0, 1] }),
                    duration: transition.duration,
                    ease: "linear",
                    onUpdate: () => {
                        const opacity = Number(target.element.style.opacity);
                        draw(stagedCry ? Number(target.element.getAttribute("data-progress")) : layer.id === outgoing.id ? 1 - opacity : opacity);
                    },
                    onComplete: () => { draw(1); finish(); },
                })) throw new Error("Expression transition target is unavailable");
            }
        } catch (error) {
            request(incoming.expression, 0, true);
            console.error("Expression crossfade failed", error);
        }
    }
    function prepared(id: number, success = true): void {
        if (disposed || !layers.some((layer) => layer.id === id)) return;
        if (pending?.strategy === "ELEMENT_BASED" && id === layers[layers.length - 1].id) {
            pending.prepared = true;
            if (!success) request(layers[layers.length - 1].expression, 0, true);
            else commit();
            return;
        }
        const target = mounted.get(id);
        if (!target) return;
        target.prepared = true;
        if (!success && pending && id === layers[layers.length - 1].id) {
            request(layers[layers.length - 1].expression, 0, true);
        } else commit();
    }
    function connect(value: AnimationEngine): void {
        if (disposed) return;
        engine = value;
        for (const [id, target] of mounted) {
            target.unregister = engine.registerTarget(name(id), target.element);
        }
        for (const [role, target] of elements) {
            target.unregister = engine.registerTarget(elementName(role), target.element);
        }
        commit();
    }
    function dispose(): void {
        if (disposed) return;
        stop();
        disposed = true;
        queued=null;
        for (const target of mounted.values()) target.unregister?.();
        mounted.clear();
        frames.clear();
        resetElements(false);
        elements.clear();
        engine = null;
    }
    return { attach, attachFrame, attachElement, prepared, request, commit, connect, dispose, get layers() { return layers; } };
}
