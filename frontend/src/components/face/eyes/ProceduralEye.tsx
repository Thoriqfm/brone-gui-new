import { createElement, useId } from "react";
import { generateEyeLayers, generateEyePaths, type EyeConfiguration, type EyeGeometry, type LayeredEyeGeometry } from "../../../geometry/eyes";
import type { GeneratedEyeNode } from "../../../geometry/eyes/layerGenerator";

export default function ProceduralEye({ geometry }: { geometry: EyeConfiguration }) {
    return "kind" in geometry ? <LayeredEye geometry={geometry} /> : <Phase1Eye geometry={geometry} />;
}

function LayeredEye({ geometry: g }: { geometry: LayeredEyeGeometry }) {
    const id = useId();
    const scene = generateEyeLayers(g, `eye-layers-${id}`);
    const render = (node: GeneratedEyeNode, key: number): React.ReactNode =>
        createElement(node.tag, { ...node.props, key }, ...node.children.map(render));
    return <svg xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink"
        width={g.width} height={g.height} viewBox={scene.viewBox} fill="none"
        preserveAspectRatio="xMidYMid meet" aria-hidden="true" data-procedural-eye={g.side}>
        {scene.layers.map(render)}
    </svg>;
}

function Phase1Eye({ geometry: g }: { geometry: EyeGeometry }) {
    const id = useId();
    const gradientId = `eye-gradient-${id}`;
    const shadowId = `eye-shadow-${id}`;
    const paths = generateEyePaths(g);
    return <svg xmlns="http://www.w3.org/2000/svg" width={g.width} height={g.height}
        viewBox={paths.viewBox} fill="none" preserveAspectRatio="xMidYMid meet"
        aria-hidden="true" data-procedural-eye={g.side}>
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
    </svg>;
}
