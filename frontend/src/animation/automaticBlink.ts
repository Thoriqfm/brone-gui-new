import type { createMorphBlinkPlayback } from "./morphBlinkPlayback";

type Playback = Pick<ReturnType<typeof createMorphBlinkPlayback>, "isBlinking" | "blinkProgress" | "playBlink">;

/** A local scheduler; playback continues to own blink timing and geometry. */
export function startAutomaticBlink(playback: Playback, clock = {
    random: () => Math.random(),
    schedule: (run: () => void, delay: number) => globalThis.setTimeout(run, delay),
    cancel: (timer: ReturnType<typeof globalThis.setTimeout>) => globalThis.clearTimeout(timer),
}) {
    let stopped = false;
    let timer: ReturnType<typeof globalThis.setTimeout>;
    const schedule = () => {
        timer = clock.schedule(() => {
            if (stopped) return;
            // Never replace a manual blink or a deliberately held inspection frame.
            if (!playback.isBlinking && playback.blinkProgress === 0) playback.playBlink();
            schedule();
        }, 3000 + clock.random() * 3000);
    };
    schedule();
    return () => { stopped = true; clock.cancel(timer); };
}
