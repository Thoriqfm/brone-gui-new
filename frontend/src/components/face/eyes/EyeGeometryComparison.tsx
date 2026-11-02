import { useState } from "react";
import { FACE_LAYER_COMPOSITIONS } from "../../../config/faceLayerAssets";
import { FACE_LAYER_LAYOUTS, FACE_LAYER_ORDER } from "../../../config/faceLayerLayouts";
import { EYE_EXPRESSIONS, EYE_EXPRESSION_PRESETS, HAPPIER_TRANSITION_PREVIEW, type EyeExpression } from "../../../geometry/eyes";
import FaceLayer from "../FaceLayer";
import ProceduralEye from "./ProceduralEye";
import EyeMorphPreview from "./EyeMorphPreview";
import EyeBlinkPreview from "./EyeBlinkPreview";

/** Development morph prototype and static references; no production expression ownership. */
export default function EyeGeometryComparison() {
    return import.meta.env.DEV ? <details className="eye-geometry-comparison">
        <summary>Eye geometry comparison (development only)</summary>
        <EyeMorphPreview />
        <EyeBlinkPreview />
        <h2>Static eye endpoint references</h2>
        <EyeGeometryComparisonView />
    </details> : null;
}

type EyePreviewExpression = EyeExpression | "happier-transition";
/** Local selection is intentionally independent from the production expression state. */
export function EyeGeometryComparisonView() {
    const [expression, setExpression] = useState<EyePreviewExpression>("idle");
    return <>
        <label>Eye expression: <select value={expression} onChange={(event) => {
            const value = event.target.value;
            if (value === "happier-transition" || EYE_EXPRESSIONS.includes(value as EyeExpression))
                setExpression(value as EyePreviewExpression);
        }}>
            {EYE_EXPRESSIONS.map((name) => <option key={name} value={name}>{name.toUpperCase()}</option>)}
            <option value="happier-transition">HAPPIER_TRANSITION_PREVIEW</option>
        </select></label>
        <p>Original SVG and procedural geometry at identical approved positions. Transition artwork is a static development reference.</p>
        <EyeEndpointComparison expression={expression} />
    </>;
}

export function EyeEndpointComparison({ expression }: { expression: EyePreviewExpression }) {
    const pair = expression === "happier-transition" ? HAPPIER_TRANSITION_PREVIEW : EYE_EXPRESSION_PRESETS[expression];
    const label = expression === "happier-transition" ? "HAPPIER_TRANSITION_PREVIEW" : expression.toUpperCase();
    return <>{(["left", "right"] as const).map((side) => {
            const key = side === "left" ? "leftEye" : "rightEye";
            const position = FACE_LAYER_LAYOUTS[expression][key];
            return <section key={`${expression}-${side}`} aria-label={`${expression} ${side} eye comparison`}>
                <h2>{label} / {side}</h2>
                <div className="face-comparison">
                    <figure><figcaption>Original SVG eye</figcaption>
                        <div className="face-canvas"><div className="face-artwork">
                            <FaceLayer asset={FACE_LAYER_COMPOSITIONS[expression][key]} position={position} order={FACE_LAYER_ORDER.eyes} />
                        </div></div>
                    </figure>
                    <figure><figcaption>Procedural inline SVG eye</figcaption>
                        <div className="face-canvas"><div className="face-artwork">
                            <div className="face-layer procedural-eye" style={{ left: position.x / 800 * 100 + "%",
                                top: position.y / 480 * 100 + "%", width: position.width / 800 * 100 + "%",
                                height: position.height / 480 * 100 + "%", zIndex: FACE_LAYER_ORDER.eyes }}>
                                <ProceduralEye geometry={pair[side]} />
                            </div>
                        </div></div>
                    </figure>
                </div>
            </section>;
        })}</>;
}
