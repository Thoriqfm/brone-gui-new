import { useId, useMemo } from "react";
import { generateMouthPaths, MOUTH_STYLE, type MouthGeometry } from "../../../geometry/mouth";

export default function ProceduralMouth({ geometry }: { geometry: MouthGeometry }) {
    const clipId = useId();
    const paths = useMemo(() => generateMouthPaths(geometry), [geometry]);
    return <svg xmlns="http://www.w3.org/2000/svg" width={paths.width} height={paths.height}
        viewBox={paths.viewBox} preserveAspectRatio="xMidYMid meet" fill="none" aria-label="Generated mouth" role="img"
        strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit={4}>
        {geometry.clipTongue && <defs><clipPath id={clipId} clipPathUnits="userSpaceOnUse">
            <path d={paths.cavity} fill="white" />
            <path d={paths.outline} fill="white" stroke="white" strokeWidth={geometry.strokeWidth} />
        </clipPath></defs>}
        <path d={paths.cavity} fill={MOUTH_STYLE.cavityFill} stroke={MOUTH_STYLE.stroke} strokeWidth={geometry.cavityStrokeWidth} />
        {paths.tongue && <path d={paths.tongue} fill={MOUTH_STYLE.tongueFill} opacity={geometry.tongueOpacity} clipPath={geometry.clipTongue ? "url(#" + clipId + ")" : undefined} />}
        <path d={paths.outline} stroke={MOUTH_STYLE.stroke} strokeWidth={geometry.strokeWidth} />
    </svg>;
}
