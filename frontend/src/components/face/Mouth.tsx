import type { Emotion } from "../../schemas/faceMessages";
export default function Mouth({
    emotion,
    intensity,
}: {
    emotion: Emotion;
    intensity: number;
}) {
    const sad = emotion === "sad" || emotion === "cry";
    return (
        <path
            d={
                sad
                    ? `M595 700 Q745 ${700 - 110 * intensity} 895 700`
                    : `M595 640 Q745 ${640 + 160 * intensity} 895 640`
            }
            fill="none"
            stroke="#82e4ff"
            strokeWidth="36"
            strokeLinecap="round"
        />
    );
}
