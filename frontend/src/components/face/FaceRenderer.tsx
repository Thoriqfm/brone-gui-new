import { useFaceStore } from "../../stores/faceStore";
import Eyes from "./Eyes";
import Mouth from "./Mouth";
import FaceEffects from "./FaceEffects";
export default function FaceRenderer() {
    const emotion = useFaceStore((s) => s.emotion);
    const intensity = useFaceStore((s) => s.intensity);
    return (
        <svg
            className="face"
            viewBox="0 0 1490 960"
            role="img"
            aria-label={`Wajah Brone ${emotion}`}
        >
            <rect width="1490" height="960" rx="90" fill="#10233a" />
            <Eyes emotion={emotion} intensity={intensity} />
            <Mouth emotion={emotion} intensity={intensity} />
            <FaceEffects emotion={emotion} />
        </svg>
    );
}
