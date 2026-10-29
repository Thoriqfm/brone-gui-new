import type { Emotion } from "../../schemas/faceMessages";
export default function Eyes({
    emotion,
    intensity,
}: {
    emotion: Emotion;
    intensity: number;
}) {
    const happy = emotion === "happy" || emotion === "happier";
    const sad = emotion === "sad" || emotion === "cry";
    return (
        <g fill="none" stroke="#82e4ff" strokeWidth="42" strokeLinecap="round">
            {happy ? (
                <>
                    <path
                        d={`M300 385 Q480 ${385 - 160 * intensity} 650 385`}
                    />
                    <path
                        d={`M840 385 Q1010 ${385 - 160 * intensity} 1190 385`}
                    />
                </>
            ) : sad ? (
                <>
                    <path d="M300 295 Q480 510 650 320" />
                    <path d="M840 320 Q1010 510 1190 295" />
                </>
            ) : (
                <>
                    <path d="M370 310 Q480 300 590 310" />
                    <path d="M900 310 Q1010 300 1120 310" />
                </>
            )}
        </g>
    );
}
