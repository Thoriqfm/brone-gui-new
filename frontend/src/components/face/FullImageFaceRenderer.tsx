import { useFaceStore } from "../../stores/faceStore";
import type { LayerExpression } from "../../config/faceLayerAssets";

// Preserve the full-image renderer and use original masters for comparison.
export default function FullImageFaceRenderer({ transition = false, expression }: { transition?: boolean; expression?: LayerExpression }) {
    const emotion = useFaceStore((s) => s.emotion);
    const name = transition ? "happier-transition" : expression ?? emotion;
    return <div className="face-canvas">
        <img className="face"
            src={`${import.meta.env.BASE_URL}assets/expressions/${name}.png`}
            alt={`Original Brone ${name}`}
            width={3200} height={1920} draggable={false}
        />
    </div>;
}
