import type { AnimationParams } from "animejs";

export interface AnimationInstance {
    play(): unknown;
    cancel(): unknown;
    revert(): unknown;
}
export interface AnimationDriver {
    create(target: HTMLElement | SVGElement, parameters: AnimationParams): AnimationInstance;
}

// Loaded only from the mounted hook, never during module evaluation or SSR.
export async function loadAnimeDriver(): Promise<AnimationDriver> {
    const { animate, engine } = await import("animejs");
    engine.fps = 40; // Experimental cap for Anime.js; native CSS/SVG animations are independent.
    return { create: (target, parameters) => animate(target, parameters) };
}

interface Run {
    instance: AnimationInstance | null;
    ready: boolean;
}
interface Target {
    element: HTMLElement | SVGElement;
    active: Run | null;
    // ponytail: one revert handle per start is retained until unregistration.
    // Compact property baselines if long-running traffic needs bounded history.
    owned: AnimationInstance[];
}
const callbackNames = [
    "onBegin", "onBeforeUpdate", "onUpdate", "onLoop", "onPause", "onComplete", "onRender",
] as const;

export function createAnimationEngine(driver: AnimationDriver) {
    const targets = new Map<string, Target>();
    let disposed = false;

    function cancel(name: string): void {
        const target = targets.get(name);
        const run = target?.active;
        if (!target || !run) return;
        target.active = null; // Invalidate callbacks BEFORE calling the driver.
        run.ready = false;
        run.instance?.cancel(); // Preserve the displayed values; do not revert here.
    }
    function unregister(name: string, target: Target): void {
        if (targets.get(name) !== target) return;
        const errors: unknown[] = [];
        try { cancel(name); } catch (error) { errors.push(error); }
        targets.delete(name);
        for (const instance of target.owned.reverse()) {
            try { instance.revert(); } catch (error) { errors.push(error); }
        }
        target.owned.length = 0;
        if (errors.length) throw new AggregateError(errors, "Animation target cleanup failed");
    }
    function registerTarget(name: string, element: HTMLElement | SVGElement): () => void {
        if (disposed) throw new Error("Animation engine is disposed");
        if (!element.isConnected) throw new Error("Animation target must be connected");
        if (targets.has(name) || [...targets.values()].some((target) => target.element === element)) {
            throw new Error("Animation target is already registered");
        }
        const target: Target = { element, active: null, owned: [] };
        targets.set(name, target);
        // Identity check makes an old ref cleanup harmless after name reuse.
        return () => unregister(name, target);
    }
    function start(name: string, parameters: AnimationParams): boolean {
        const target = targets.get(name);
        if (disposed || !target) return false;
        if (!target.element.isConnected) {
            unregister(name, target);
            return false;
        }
        cancel(name);
        const run: Run = { instance: null, ready: false };
        target.active = run;
        const guarded: AnimationParams = { ...parameters, autoplay: false };
        for (const key of callbackNames) {
            guarded[key] = (animation) => {
                if (disposed || targets.get(name) !== target || target.active !== run || !run.ready) return;
                if (!target.element.isConnected) {
                    unregister(name, target);
                    return;
                }
                if (key === "onComplete") {
                    target.active = null;
                    run.ready = false;
                }
                parameters[key]?.(animation);
            };
        }
        try {
            // Attach ownership before play: creation is always non-autoplay,
            // and callbacks during construction are suppressed until ready.
            const instance = driver.create(target.element, guarded);
            run.instance = instance;
            target.owned.push(instance);
            run.ready = true;
            instance.play();
        } catch (error) {
            // A callback may already have started a replacement before throwing.
            if (targets.get(name) === target && target.active === run) cancel(name);
            throw error;
        }
        return true;
    }
    function cancelAll(): void {
        const errors: unknown[] = [];
        for (const name of targets.keys()) {
            try { cancel(name); } catch (error) { errors.push(error); }
        }
        if (errors.length) throw new AggregateError(errors, "Animation cancellation failed");
    }
    function dispose(): void {
        if (disposed) return;
        disposed = true;
        const errors: unknown[] = [];
        for (const [name, target] of targets) {
            try { unregister(name, target); } catch (error) { errors.push(error); }
        }
        if (errors.length) throw new AggregateError(errors, "Animation engine cleanup failed");
    }
    return {
        registerTarget, start, cancel, cancelAll, dispose,
        hasTarget: (name: string) => targets.has(name),
        isAnimating: (name: string) => Boolean(targets.get(name)?.active),
        get disposed() { return disposed; },
    };
}
export type AnimationEngine = ReturnType<typeof createAnimationEngine>;
