import { useState } from "react";
import Mouth from "../Mouth";
import { FACE_LAYER_LAYOUTS, FACE_LAYER_ORDER } from "../../../config/faceLayerLayouts";
import { MOUTH_EXPRESSION_PRESETS, MOUTH_EXPRESSIONS, MOUTH_LABELS, type MouthExpression } from "../../../geometry/mouth";
import MouthMorphPreview from "./MouthMorphPreview";
import ProceduralMouth from "./ProceduralMouth";

/** Isolated development preview; never writes expression or animation state. */
export default function MouthGeometryComparison() {
    return import.meta.env.DEV ? <DevelopmentComparison /> : null;
}

function DevelopmentComparison() {
    const [expression, setExpression] = useState<MouthExpression>("idle");
    const position = FACE_LAYER_LAYOUTS[expression].mouth;
    return <details className="mouth-geometry-comparison">
        <summary>Mouth geometry comparison (development only)</summary>
        <MouthMorphPreview />
        <h2>Static endpoint references</h2>
        <label>Static mouth: <select value={expression} onChange={(event) =>
            setExpression(MOUTH_EXPRESSIONS.includes(event.target.value as MouthExpression) ? event.target.value as MouthExpression : "idle")}>
            {MOUTH_EXPRESSIONS.map((name) => <option key={name} value={name}>{MOUTH_LABELS[name]}</option>)}
        </select></label>
        <p>Approved asset and generated geometry at identical logical positions. Production faces above continue using SVG assets.</p>
        <div className="face-comparison">
            <figure><figcaption>Original SVG mouth (static)</figcaption>
                <div className="face-canvas"><div className="face-artwork"><Mouth expression={expression} /></div></div>
            </figure>
            <figure><figcaption>Generated procedural mouth (static)</figcaption>
                <div className="face-canvas"><div className="face-artwork">
                    <div className="face-layer procedural-mouth" style={{ left: position.x / 800 * 100 + "%",
                        top: position.y / 480 * 100 + "%", width: position.width / 800 * 100 + "%",
                        height: position.height / 480 * 100 + "%", zIndex: FACE_LAYER_ORDER.mouth }}>
                        <ProceduralMouth geometry={MOUTH_EXPRESSION_PRESETS[expression].geometry} />
                    </div>
                </div></div>
            </figure>
        </div>
    </details>;
}
