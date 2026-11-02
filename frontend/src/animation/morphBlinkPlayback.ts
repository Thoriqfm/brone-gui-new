import { blinkProgress } from "../geometry/eyes/blink/blinkInterpolator";
import type { AnimationEngine } from "./animationEngine";

export function createBlinkChannel() {
    let progress = 0;
    const listeners = new Set<() => void>();
    return { get progress() { return progress; },
        set(value: number) { const next=blinkProgress(value); if(next===progress)return; progress=next; for (const fn of listeners) fn(); },
        subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    };
}
export type BlinkChannel = ReturnType<typeof createBlinkChannel>;
export const MORPH_BLINK_TIMING = {closing:100,hold:40,opening:150} as const;
/** Local DOM targets, owned by the existing engine; neither scalar owns the other. */
export function createMorphBlinkPlayback(engine: AnimationEngine, morph: HTMLElement, blink: HTMLElement,
    draw: (m: number,b: number) => void, channel: BlinkChannel) {
    let disposed=false;
    const read = (node: HTMLElement) => Number(node.getAttribute("data-progress") ?? 0);
    const update = () => { if (!disposed) { channel.set(read(blink)); draw(read(morph),channel.progress); } };
    const releaseMorph=engine.registerTarget("morph-blink-preview-progress",morph);
    const releaseBlink=engine.registerTarget("morph-blink-progress",blink);
    const renew = (name: string,node: HTMLElement) => {
        engine.cancel(name);
        // Refresh registration to bound the engine's revert history, preserving
        // the currently displayed attribute when the previous run is reverted.
        const progress=read(node);
        if (name==="morph-blink-progress") { releaseCurrentBlink(); releaseCurrentBlink=engine.registerTarget(name,node); }
        else { releaseCurrentMorph(); releaseCurrentMorph=engine.registerTarget(name,node); }
        node.setAttribute("data-progress",String(progress));
    };
    let releaseCurrentMorph=releaseMorph, releaseCurrentBlink=releaseBlink;
    const seek = (node: HTMLElement,name: string,p: number) => {
        if (disposed) return;
        const progress=blinkProgress(p); renew(name,node); node.setAttribute("data-progress",String(progress)); update();
    };
    update();
    return {
        get morphProgress() { return read(morph); }, get blinkProgress() { return read(blink); },
        get isMorphing() { return engine.isAnimating("morph-blink-preview-progress"); },
        get isBlinking() { return engine.isAnimating("morph-blink-progress"); },
        seekMorph(p: number) { seek(morph,"morph-blink-preview-progress",p); },
        seekBlink(p: number) { seek(blink,"morph-blink-progress",p); },
        playMorph(target: 0|1,duration: number) {
            if (disposed) return;
            if (!Number.isFinite(duration) || duration<0) throw new RangeError("Invalid morph duration");
            renew("morph-blink-preview-progress",morph);
            engine.start("morph-blink-preview-progress",{"data-progress":[read(morph),target],duration,ease:"inOutSine",onUpdate:update,onComplete:update});
        },
        playBlink() {
            if (disposed) return;
            renew("morph-blink-progress",blink);
            engine.start("morph-blink-progress",{"data-progress":[read(blink),1],duration:MORPH_BLINK_TIMING.closing,ease:"inOutSine",onUpdate:update,
                onComplete:() => {
                    if (disposed) return;
                    engine.start("morph-blink-progress",{"data-progress":[1,0],delay:MORPH_BLINK_TIMING.hold,duration:MORPH_BLINK_TIMING.opening,ease:"inOutSine",onUpdate:update,onComplete:update});
                }});
        },
        dispose() {
            if (disposed) return;
            const m=read(morph),b=read(blink);
            disposed=true; releaseCurrentMorph(); releaseCurrentBlink();
            // A StrictMode cleanup/setup cycle must retain displayed scalars;
            // unregistering reverts owned attributes, so restore them locally.
            morph.setAttribute("data-progress",String(m)); blink.setAttribute("data-progress",String(b));
        },
    };
}
