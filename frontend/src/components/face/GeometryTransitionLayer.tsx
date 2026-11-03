import { useId, useLayoutEffect, useMemo, useRef } from "react";
import type { TransitionComposition } from "../../animation/expressionTransition";
import { sampleProductionGeometry, productionEyeMorphContext } from "../../animation/productionGeometry";
import type { BlinkChannel } from "../../animation/morphBlinkPlayback";
import { updateMorphBlinkSurface } from "./eyes/MorphBlinkEye";
import { positionGeometry, updateProductionEye, updateProductionMouth } from "../../animation/productionGeometryDom";
import { isEmotion } from "../../schemas/faceMessages";
import Eyes from "./Eyes";
import Mouth from "./Mouth";
import FaceEffects from "./FaceEffects";
import { sampleFaceTransitionProgress, updateFaceEffectMotion } from "../../animation/faceEffectMotion";

export default function GeometryTransitionLayer({ layers, attach, attachFrame, prepared, blinkChannel }: {
    layers: readonly TransitionComposition[];
    attach: (id: number, element: HTMLDivElement | null) => void;
    attachFrame: (id: number, frame: ((progress: number) => void) | null) => void;
    prepared: (id: number, success: boolean) => void;
    blinkChannel?: BlinkChannel;
}) {
    const [source, target] = layers;
    const from = source.expression, to = target.expression;
    if (!isEmotion(from) || !isEmotion(to)) throw new RangeError("Geometry requires canonical expressions");
    const root = useRef<HTMLDivElement>(null), scope = "production-" + useId();
    const middle = useMemo(() => sampleProductionGeometry(from, to, .5), [from, to]);
    useLayoutEffect(() => {
        const element = root.current!;
        const endpoints = element.querySelectorAll<HTMLDivElement>("[data-geometry-endpoint]");
        const overlay = element.querySelector<HTMLDivElement>("[data-geometry-overlay]")!;
        const left = overlay.querySelector<HTMLDivElement>('[data-geometry-eye="left"]')!;
        const right = overlay.querySelector<HTMLDivElement>('[data-geometry-eye="right"]')!;
        const mouth = overlay.querySelector<HTMLDivElement>("[data-geometry-mouth]")!;
        const effects = overlay.querySelectorAll<HTMLDivElement>("[data-geometry-effects]");
        const templates = element.querySelectorAll<SVGSVGElement>("[data-idle-eye-templates] svg");
        const draw = (p: number) => {
            endpoints[0].style.display = p <= 0 ? "contents" : "none";
            endpoints[1].style.display = p >= 1 ? "contents" : "none";
            overlay.style.display = p > 0 && p < 1 ? "contents" : "none";
            if (p <= 0 || p >= 1) return; // Untouched canonical React SVG endpoints.
            const faceProgress = sampleFaceTransitionProgress(from, to, p);
            const frame = sampleProductionGeometry(from, to, faceProgress);
            for (const [side, node, template] of [["left", left, templates[0]], ["right", right, templates[1]]] as const) {
                positionGeometry(node, frame.layout[side === "left" ? "leftEye" : "rightEye"]);
                if (import.meta.env.DEV && blinkChannel) updateMorphBlinkSurface(node.querySelector("[data-active-eye] svg")!,{
                    ...productionEyeMorphContext(from,to,faceProgress),side,blinkProgress:blinkChannel.progress,current:frame.eyes[side],
                });
                else updateProductionEye(node.querySelector("svg")!, frame.eyes[side], scope + "-" + side, template);
            }
            positionGeometry(mouth, frame.layout.mouth);
            updateProductionMouth(mouth.querySelector("svg")!, frame.mouth, scope + "-mouth");
            updateFaceEffectMotion(effects[0], from, "exit", p, to);
            updateFaceEffectMotion(effects[1], to, "enter", p, from);
        };
        attach(target.id, element); attachFrame(target.id, draw);
        draw(0);
        let stopped = false;
        void Promise.all(Array.from(element.getElementsByTagName("img"))
            .map(image => typeof image.decode === "function" ? image.decode() : Promise.resolve()))
            .then(() => { if (!stopped) prepared(target.id, true); },
                () => { if (!stopped) prepared(target.id, false); });
        return () => { stopped = true; attachFrame(target.id, null); attach(target.id, null); };
    }, [from, to, target.id, attach, attachFrame, prepared, scope, blinkChannel]);
    return <div ref={root} className="expression-composition" data-expression={to} data-progress="0" data-transition="geometry" aria-hidden="true">
        <div hidden data-idle-eye-templates="true"><Eyes expression="idle" renderer="procedural" /></div>
        {[from, to].map((expression, index) => <div key={index} data-geometry-endpoint={expression}
            style={{ display: index === 0 ? "contents" : "none" }}>
            <Eyes expression={expression} renderer="procedural" blinkChannel={blinkChannel} />
            <Mouth expression={expression} renderer="procedural" />
            <FaceEffects expression={expression} motion />
        </div>)}
        <div data-geometry-overlay="true" style={{ display: "none" }}>
            <Eyes expression={from} renderer="procedural" sample={middle} blinkChannel={blinkChannel} blinkContext={productionEyeMorphContext(from,to,.5)} />
            <Mouth expression={from} renderer="procedural" sample={middle} />
            <div className="geometry-effects" data-geometry-effects="source"><FaceEffects expression={from} motion resting={false} /></div>
            <div className="geometry-effects" data-geometry-effects="target"><FaceEffects expression={to} motion resting={false} /></div>
        </div>
    </div>;
}
