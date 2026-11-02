/** Coordinates are relative to viewBox dimensions; Bezier controls may lie outside [0,1]. */
export type MouthPoint = readonly [number, number];
export type MouthCurve = readonly [MouthPoint, MouthPoint, MouthPoint];
export interface MouthContour {
    readonly start: MouthPoint;
    readonly curves: readonly MouthCurve[];
}
export interface MouthGeometry {
    readonly width: number;
    readonly height: number;
    readonly strokeWidth: number;
    readonly cavityStrokeWidth: number;
    readonly cavity: MouthContour;
    readonly tongue: MouthContour | null;
    /** Defaults to the cavity; independent for artwork with a different outline. */
    readonly outline?: MouthContour;
    /** Only the tongue may fade when transitioning to an expression without one. */
    readonly tongueOpacity?: number;
    /** Restrict intermediate tongue paint to the mouth silhouette. */
    readonly clipTongue?: boolean;
}
