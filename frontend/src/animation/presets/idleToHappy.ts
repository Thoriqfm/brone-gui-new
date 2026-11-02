import type { AnimationParams } from "animejs";

// Fractions of the accepted request duration; no new wire-level timing fields.
export const IDLE_TO_HAPPY = {
    leftEye: { delay: 0, peakScale: 1.025 },
    rightEye: { delay: 0.06, peakScale: 1.022 },
    incomingMouth: { delay: 0.12, startScale: 0.97 },
    outgoingMouth: { duration: 0.4 },
} as const;
export type ElementTarget = "left-eye" | "right-eye" | "mouth" | "mouth-outgoing" | `effect:${string}`;

export function idleToHappy(duration: number): readonly { target: ElementTarget; parameters: AnimationParams }[] {
    const eye = (config: typeof IDLE_TO_HAPPY.leftEye | typeof IDLE_TO_HAPPY.rightEye): AnimationParams => ({
        scale: [1, config.peakScale, 1], delay: duration * config.delay,
        duration: duration * (1 - config.delay), ease: "inOutSine",
    });
    return [
        { target: "left-eye", parameters: eye(IDLE_TO_HAPPY.leftEye) },
        { target: "right-eye", parameters: eye(IDLE_TO_HAPPY.rightEye) },
        { target: "mouth-outgoing", parameters: {
            opacity: [1, 0], duration: duration * IDLE_TO_HAPPY.outgoingMouth.duration, ease: "outQuad",
        } },
        { target: "mouth", parameters: {
            scale: [IDLE_TO_HAPPY.incomingMouth.startScale, 1], opacity: [0, 1],
            delay: duration * IDLE_TO_HAPPY.incomingMouth.delay,
            duration: duration * (1 - IDLE_TO_HAPPY.incomingMouth.delay), ease: "outQuad",
        } },
    ];
}
