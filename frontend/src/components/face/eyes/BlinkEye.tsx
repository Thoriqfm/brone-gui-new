import { useId } from "react";
import { generateEyePaths, type EyeGeometry } from "../../../geometry/eyes";
import type { BlinkGeometry } from "../../../geometry/eyes/blink";


/** Development-only aperture renderer. Original artwork is never deformed. */
export default function BlinkEye({ geometry }: { geometry: BlinkGeometry }) {
    const id = "blink-" + useId(), blink = "kind" in geometry ? geometry : null;
    const source = blink ? blink.source : geometry as Exclude<BlinkGeometry, {kind:string}>;
    const aperture = id + "-aperture", boundary = id + "-boundary";
    return <svg xmlns="http://www.w3.org/2000/svg" width={source.width} height={source.height}
        viewBox={`0 0 ${source.width} ${source.height}`} fill="none" aria-hidden="true"
        data-blink-side={source.side} data-blink-clip={aperture}>
        <defs>
            <clipPath id={aperture} clipPathUnits="userSpaceOnUse"><path data-blink-aperture="" d={blink?.aperture ?? ""} /></clipPath>
            <clipPath id={boundary} clipPathUnits="userSpaceOnUse"><path d={generateEyePaths(source).outline} /></clipPath>
        </defs>
        <g data-blink-interior="" visibility={blink?.interiorVisible === false ? "hidden" : "visible"}
            clipPath={blink ? `url(#${aperture})` : "none"}><IdleBlinkArtwork geometry={source} /></g>
        <g clipPath={`url(#${boundary})`} stroke={source.stroke} strokeWidth={source.strokeWidth} fill="none">
            <path data-blink-upper="" d={blink?.upperPath ?? ""} />
            <path data-blink-lower="" d={blink && blink.progress < 1 ? blink.lowerPath : ""} />
        </g>
    </svg>;
}

/** Animation writes only local SVG attributes; no React/store frame updates. */
export function applyBlinkGeometry(svg: SVGSVGElement, geometry: BlinkGeometry): void {
    const blink = "kind" in geometry ? geometry : null;
    svg.querySelector("[data-blink-aperture]")!.setAttribute("d", blink?.aperture ?? "");
    const interior = svg.querySelector("[data-blink-interior]")!;
    interior.setAttribute("visibility", blink?.interiorVisible === false ? "hidden" : "visible");
    interior.setAttribute("clip-path", blink ? `url(#${svg.getAttribute("data-blink-clip")})` : "none");
    svg.querySelector("[data-blink-upper]")!.setAttribute("d", blink?.upperPath ?? "");
    svg.querySelector("[data-blink-lower]")!.setAttribute("d", blink && blink.progress < 1 ? blink.lowerPath : "");
}

// Keep source paint primitives explicit: nesting a second SVG introduces a viewport clip
// and changes edge antialiasing. Raster checks compare this scene to both actual assets.
function IdleBlinkArtwork({ geometry: g }: { geometry: EyeGeometry }) {
    const id = useId();
    const gradientId = `eye-gradient-${id}`;
    const shadowId = `eye-shadow-${id}`;
    const paths = generateEyePaths(g);
    return <>
        <g filter={`url(#${shadowId})`}>
            <ellipse cx={g.body.center[0]} cy={g.body.center[1]} rx={g.body.radius[0]} ry={g.body.radius[1]}
                fill={`url(#${gradientId})`} />
        </g>
        <path d={paths.outline} stroke={g.stroke} strokeWidth={g.strokeWidth} />
        {g.highlights.ellipse && <ellipse cx={g.highlights.ellipse.center[0]} cy={g.highlights.ellipse.center[1]}
            rx={g.highlights.ellipse.radius[0]} ry={g.highlights.ellipse.radius[1]}
            fill={g.highlights.fill} opacity={g.highlights.opacity} />}
        {paths.highlight && <path d={paths.highlight} fill={g.highlights.fill} opacity={g.highlights.opacity} />}
        <defs>
            <filter id={shadowId} x={g.shadow.region[0]} y={g.shadow.region[1]}
                width={g.shadow.region[2]} height={g.shadow.region[3]}
                filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                <feFlood floodOpacity="0" result="BackgroundImageFix" />
                <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
                <feColorMatrix in="SourceAlpha" type="matrix"
                    values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
                <feOffset dy={g.shadow.offsetY} />
                <feGaussianBlur stdDeviation={g.shadow.blur} />
                <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
                <feColorMatrix type="matrix" values={`0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${g.shadow.opacity} 0`} />
                <feBlend mode="normal" in2="shape" result="innerShadow" />
            </filter>
            <linearGradient id={gradientId} x1={g.gradient.start[0]} y1={g.gradient.start[1]}
                x2={g.gradient.end[0]} y2={g.gradient.end[1]} gradientUnits="userSpaceOnUse">
                {g.gradient.stops.map((stop, i) => <stop key={i} offset={stop.offset} stopColor={stop.color} />)}
            </linearGradient>
        </defs>
    </>;
}
