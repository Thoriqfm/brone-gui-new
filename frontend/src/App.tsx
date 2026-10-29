import { useEffect } from "react";
import FaceRenderer from "./components/face/FaceRenderer";
import { connectFaceSocket } from "./services/websocketClient";
import { useFaceStore } from "./stores/faceStore";
import { EMOTIONS } from "./schemas/faceMessages";
export default function App() {
    const emotion = useFaceStore((s) => s.emotion);
    const intensity = useFaceStore((s) => s.intensity);
    const connected = useFaceStore((s) => s.connected);
    const setEmotion = useFaceStore((s) => s.setEmotion);
    useEffect(() => connectFaceSocket(), []);
    return (
        <main>
            <header>
                <h1>
                    BRONE GUI <small>Prototype v0.1</small>
                </h1>
                <span className={connected ? "status online" : "status"}>
                    {connected ? "Backend connected" : "Backend disconnected"}
                </span>
            </header>
            <FaceRenderer />
            <section>
                <h2>Manual test</h2>
                <div className="buttons">
                    {EMOTIONS.map((e) => (
                        <button
                            key={e}
                            onClick={() => setEmotion(e, intensity)}
                            className={emotion === e ? "active" : ""}
                        >
                            {e}
                        </button>
                    ))}
                </div>
                <label>
                    Intensity: {intensity.toFixed(1)}{" "}
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={intensity}
                        onChange={(e) =>
                            setEmotion(emotion, Number(e.target.value))
                        }
                    />
                </label>
                <p>
                    Perintah dari backend juga akan memperbarui wajah. Aset dan
                    animasi asli Brone belum dipasang.
                </p>
            </section>
        </main>
    );
}
