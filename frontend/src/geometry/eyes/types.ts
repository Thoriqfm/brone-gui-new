/** Native SVG coordinates. Layout belongs to FACE_LAYER_LAYOUTS, never this model. */
export type EyePoint = readonly [number, number];
export type EyeCurve = readonly [EyePoint, EyePoint, EyePoint];
export interface EyeContour {
    readonly start: EyePoint;
    readonly curves: readonly EyeCurve[];
}
export interface EyeEllipse {
    readonly center: EyePoint;
    readonly radius: EyePoint;
}
export interface EyeGeometry {
    readonly side: "left" | "right";
    readonly width: number;
    readonly height: number;
    readonly body: EyeEllipse;
    readonly outline: EyeContour;
    readonly stroke: string;
    readonly strokeWidth: number;
    readonly gradient: {
        readonly start: EyePoint;
        readonly end: EyePoint;
        readonly stops: readonly { readonly offset: number; readonly color: string }[];
    };
    /** Source inner-shadow pipeline, applied only to the body. */
    readonly shadow: {
        readonly region: readonly [number, number, number, number];
        readonly offsetY: number;
        readonly blur: number;
        readonly opacity: number;
    };
    readonly highlights: {
        readonly ellipse: EyeEllipse | null;
        readonly contour: EyeContour | null;
        readonly fill: string;
        readonly opacity: number;
    };
}

/** Ordered native-coordinate commands, including the source's explicit close. */
export type EyeCommand = readonly ["M" | "L", number, number]
    | readonly ["C", number, number, number, number, number, number] | readonly ["Z"];
export interface EyeReference { readonly ref: string }
export type EyePaint = "none" | "black" | "white" | `#${string}` | EyeReference;
export type EyeTransform = { readonly kind: "matrix"; readonly values: readonly [number, number, number, number, number, number] }
    | { readonly kind: "rotate"; readonly values: readonly [number, number, number] };
interface EyePaintAttributes {
    readonly id?: string;
    readonly fill?: EyePaint;
    readonly stroke?: EyePaint;
    readonly strokeWidth?: number;
    readonly strokeLinejoin?: "round";
    readonly opacity?: number;
    readonly fillOpacity?: number;
    readonly filter?: EyeReference;
    readonly mask?: EyeReference;
    readonly transform?: EyeTransform;
}
/** Closed set of SVG features actually present in the approved eye exports. */
export interface EyeSvgAttributes {
    g: EyePaintAttributes;
    path: EyePaintAttributes;
    ellipse: EyePaintAttributes & { readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number };
    rect: EyePaintAttributes & { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
    use: EyePaintAttributes & { readonly xlinkHref: EyeReference };
    mask: EyePaintAttributes & { readonly id: string; readonly maskUnits?: "userSpaceOnUse";
        readonly x?: number; readonly y?: number; readonly width?: number; readonly height?: number };
    defs: Record<string, never>;
    linearGradient: { readonly id: string; readonly x1: number; readonly y1: number;
        readonly x2: number; readonly y2: number; readonly gradientUnits: "userSpaceOnUse" };
    stop: { readonly offset: number; readonly stopColor: EyePaint };
    filter: { readonly id: string; readonly x: number; readonly y: number; readonly width: number;
        readonly height: number; readonly filterUnits: "userSpaceOnUse"; readonly colorInterpolationFilters: "sRGB" };
    feFlood: { readonly floodOpacity: number; readonly result: string };
    feBlend: { readonly mode: "normal"; readonly in?: string; readonly in2: string; readonly result: string };
    feColorMatrix: { readonly in?: string; readonly type: "matrix"; readonly values: readonly number[]; readonly result?: string };
    feOffset: { readonly dy: number };
    feGaussianBlur: { readonly stdDeviation: number; readonly result?: string };
    feComposite: { readonly in2: string; readonly operator: "arithmetic"; readonly k2: number; readonly k3: number };
}
export type EyeSvgNode = { [K in keyof EyeSvgAttributes]: {
    readonly tag: K;
    readonly attributes: EyeSvgAttributes[K];
    readonly children: readonly EyeSvgNode[];
} & (K extends "path" ? { readonly commands: readonly EyeCommand[] } : { readonly commands?: never })
}[keyof EyeSvgAttributes];
export interface LayeredEyeGeometry {
    readonly kind: "layered";
    readonly side: "left" | "right";
    readonly width: number;
    readonly height: number;
    /** Document order, including masks embedded in painted groups and trailing defs. */
    readonly layers: readonly EyeSvgNode[];
}
export type EyeConfiguration = EyeGeometry | LayeredEyeGeometry;
