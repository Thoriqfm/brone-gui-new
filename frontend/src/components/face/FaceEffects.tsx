import type { Emotion } from "../../schemas/faceMessages";
export default function FaceEffects({ emotion }: { emotion: Emotion }) {
    return emotion === "shy" ? (
        <>
            <circle cx="240" cy="575" r="42" fill="#fa90b0" opacity=".55" />
            <circle cx="1250" cy="575" r="42" fill="#fa90b0" opacity=".55" />
        </>
    ) : null;
}
