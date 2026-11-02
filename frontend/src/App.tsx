import { useEffect, useState } from "react";
import FaceRenderer from "./components/face/FaceRenderer";
import MouthGeometryComparison from "./components/face/mouth/MouthGeometryComparison";
import EyeGeometryComparison from "./components/face/eyes/EyeGeometryComparison";
import FullImageFaceRenderer from "./components/face/FullImageFaceRenderer";
import ProductionGeometryComparison from "./components/face/ProductionGeometryComparison";
import type { FaceRendererMode } from "./animation/productionGeometry";
import { connectFaceSocket } from "./services/websocketClient";
import { useFaceStore } from "./stores/faceStore";
import { EMOTIONS } from "./schemas/faceMessages";
import { MANUAL_TRANSITION_MS, requestExpression } from "./animation/expressionController";

const websocketEnabled = import.meta.env.VITE_WS_ENABLED === "true";

export default function App() {
    const emotion = useFaceStore((s) => s.emotion);
    const intensity = useFaceStore((s) => s.intensity);
    const connected = useFaceStore((s) => s.connected);
    const [transition, setTransition] = useState(false);
    const [view, setView] = useState("compare");
    const [renderer, setRenderer] = useState<FaceRendererMode>("asset");
    useEffect(() => {
        if (websocketEnabled) return connectFaceSocket((request) => {
            // Valid duplicates also exit preview, without changing canonical state.
            if (requestExpression(request) !== "rejected") setTransition(false);
        });
    }, []);
    return (
        <main>
            <header>
                <h1>BRONE GUI <small>Static layer comparison</small></h1>
                <span className={connected ? "status online" : "status"}>
                    {!websocketEnabled ? "Frontend only - WebSocket disabled" : connected ? "Backend connected" : "Backend disconnected"}
                </span>
            </header>
            <section aria-label="Development preview controls">
                <h2>Expression preview</h2>
                <div className="buttons">
                    {EMOTIONS.map((e) => (
                        <button type="button" key={e}
                            onClick={() => {
                                setTransition(false);
                                requestExpression({ emotion: e, intensity,
                                    transitionMs: MANUAL_TRANSITION_MS, source: "manual" });
                            }}
                            className={!transition && emotion === e ? "active" : ""}
                            aria-pressed={!transition && emotion === e}>
                            {e}
                        </button>
                    ))}
                    <button type="button" onClick={() => setTransition(true)}
                        className={transition ? "active" : ""} aria-pressed={transition}>
                        happier-transition (preview only)
                    </button>
                </div>
                <label>View: {" "}
                    <select value={view} onChange={(event) => setView(event.target.value)}>
                        <option value="compare">Compare at equal dimensions</option>
                        <option value="layers">Layers only</option>
                        <option value="reference">Original image only</option>
                    </select>
                </label>
                {import.meta.env.DEV && <label> Live renderer: <select aria-label="Live renderer" value={renderer}
                    onChange={event => { if (event.target.value === "asset" || event.target.value === "procedural") setRenderer(event.target.value); }}>
                    <option value="asset">Original asset (default)</option><option value="procedural">Procedural geometry (opt-in)</option>
                </select></label>}
                <p role="status">
                    {transition ? "Static transition preview; protocol emotion is unchanged." : `Selected: ${emotion}.`}
                </p>
                <p>Development comparison: 800 x 480 artwork centered in a 1490 x 960 canvas.
                    Renderer: {renderer}. Procedural rendering morphs eyes and mouth independently, using Idle bridges where required.
                    Production blinking is disabled. Visual intensity and visemes are not implemented. Cry SVG tears differ from the master gradients.</p>
            </section>
            <div className={view === "compare" ? "face-comparison" : ""}>
                {view !== "layers" && <figure>
                    <figcaption>Original full-image PNG reference</figcaption>
                    <FullImageFaceRenderer transition={transition} />
                </figure>}
                {view !== "reference" && <figure>
                    <figcaption>Composed SVG layers</figcaption>
                    <FaceRenderer transition={transition} renderer={renderer} />
                </figure>}
            </div>
            <ProductionGeometryComparison />
            <MouthGeometryComparison />
            <EyeGeometryComparison />
        </main>
    );
}
