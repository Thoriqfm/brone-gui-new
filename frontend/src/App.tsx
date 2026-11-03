import { useEffect, useState } from "react";
import FaceRenderer from "./components/face/FaceRenderer";
import RobotFaceStage from "./components/face/RobotFaceStage";
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
    const connected = useFaceStore((s) => s.connected);
    const [transition, setTransition] = useState(false);
    const [view, setView] = useState("compare");
    const [renderer, setRenderer] = useState<FaceRendererMode>("procedural");
    const [controlsOpen, setControlsOpen] = useState(false);
    const [developmentOpen, setDevelopmentOpen] = useState(false);
    const [fullscreenError, setFullscreenError] = useState("");
    const selectExpression = (index: number) => {
        setTransition(false);
        requestExpression({ emotion: EMOTIONS[index], intensity: useFaceStore.getState().intensity,
            transitionMs: MANUAL_TRANSITION_MS, source: "manual" });
    };
    const toggleControls = () => {
        setDevelopmentOpen(false);
        setTransition(false);
        setControlsOpen(open => !open);
    };
    const toggleFullscreen = async () => {
        setFullscreenError("");
        try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await document.documentElement.requestFullscreen();
        } catch {
            setFullscreenError("Fullscreen could not be opened. You can still use the full-window preview.");
            setControlsOpen(true);
        }
    };
    useEffect(() => {
        if (websocketEnabled) return connectFaceSocket((request) => {
            // Valid duplicates also exit preview, without changing canonical state.
            if (requestExpression(request) !== "rejected") setTransition(false);
        });
    }, []);
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (event.defaultPrevented || event.repeat || event.ctrlKey || event.altKey || event.metaKey ||
                target?.isContentEditable || target?.closest?.("input, textarea, select, [contenteditable], [role='textbox']")) return;
            const index = "12345678".indexOf(event.key);
            if (event.key.length === 1 && index >= 0) {
                event.preventDefault();
                selectExpression(index);
            } else if (event.key.toLowerCase() === "h") {
                event.preventDefault();
                toggleControls();
            } else if (event.key.toLowerCase() === "f") {
                event.preventDefault();
                void toggleFullscreen();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);
    return (
        <main className="robot-preview">
            <RobotFaceStage renderer={renderer} active={!developmentOpen} />
            {controlsOpen && <aside id="face-controls" className="face-controls" aria-label="Face controls">
                <h1>Brone controls</h1>
                <span className={connected ? "status online" : "status"}>
                    {!websocketEnabled ? "Frontend only - WebSocket disabled" : connected ? "Backend connected" : "Backend disconnected"}
                </span>
                <p role="status">Current expression: {emotion}. Transition: {MANUAL_TRANSITION_MS} ms.</p>
                <div className="buttons">
                    {EMOTIONS.map((e, index) => (
                        <button type="button" key={e}
                            onClick={() => selectExpression(index)}
                            className={emotion === e ? "active" : ""}
                            aria-label={e} aria-keyshortcuts={String(index + 1)} aria-pressed={emotion === e}>
                            <kbd>{index + 1}</kbd> {e}
                        </button>
                    ))}
                </div>
                <label>Renderer: <select aria-label="Live renderer" value={renderer}
                    onChange={event => { if (event.target.value === "asset" || event.target.value === "procedural") setRenderer(event.target.value); }}>
                    <option value="procedural">Procedural geometry</option><option value="asset">Original asset</option>
                </select></label>
                <p><kbd>1–8</kbd> expression · <kbd>H</kbd> controls · <kbd>F</kbd> fullscreen. Use Esc to leave browser fullscreen.</p>
                <div className="buttons">
                    <button type="button" aria-keyshortcuts="F" onClick={() => void toggleFullscreen()}>Toggle fullscreen</button>
                    {import.meta.env.DEV && <button type="button" onClick={() => { setDevelopmentOpen(true); setControlsOpen(false); }}>Development previews</button>}
                </div>
                {fullscreenError && <p role="alert">{fullscreenError}</p>}
            </aside>}
            {import.meta.env.DEV && developmentOpen && <section className="development-tools" aria-label="Development previews">
                <header><h1>Development previews</h1><button type="button" onClick={() => { setDevelopmentOpen(false); setTransition(false); }}>Close previews</button></header>
                <div className="buttons">
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
                <p role="status">
                    {transition ? "Static transition preview; protocol emotion is unchanged." : `Selected: ${emotion}.`}
                </p>
                <p>Development comparison: 800 x 480 artwork centered in a 1490 x 960 canvas.
                    Renderer: {renderer}. Procedural rendering morphs eyes and mouth independently, using Idle bridges where required.
                    The main robot view blinks automatically. Visual intensity and visemes are not implemented. Cry SVG tears differ from the master gradients.</p>
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
            </section>}
        </main>
    );
}
