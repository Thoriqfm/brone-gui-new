import type { MouthContour, MouthGeometry } from "./types";

// Absolute cubic controls extracted from the approved SVGs; no curve approximation.
const measured = {
    SAD: { width: 276, height: 86, strokeWidth: 8, cavityStrokeWidth: 5,
        cavity: { start: [13.9782,77.3988], curves: [
            [[10.2575,79.2825],[6.19157,75.1401],[8.5855,71.7253]],
            [[70.6082,-16.7466],[204.392,-16.7466],[266.415,71.7253]],
            [[268.808,75.1401],[264.742,79.2825],[261.022,77.3988]],
            [[193.136,43.0289],[81.8636,43.0289],[13.9782,77.3988]],
        ] },
        tongue: { start: [137.816,33.4229], curves: [
            [[195.138,33.4229],[242.692,49.4792],[251.639,70.5179]],
            [[252.813,73.2794],[249.873,75.4054],[247.106,74.2429]],
            [[215.339,60.8953],[175.977,54.1729],[136.502,54.1729]],
            [[98.33,54.1729],[60.2626,60.4581],[29.0669,72.942]],
            [[26.1904,74.0932],[23.2794,71.7601],[24.7061,69.0098]],
            [[35.2332,48.7168],[81.8723,33.4229],[137.816,33.4229]],
        ] },
        outline: { start: [268.601,72.3941], curves: [
            [[206.571,-19.0641],[69.0071,-18.7973],[7.41849,73.1947]],
            [[5.24372,76.443],[8.73474,80.3917],[12.3693,78.9524]],
            [[82.3638,51.2356],[198.083,50.9721],[263.457,78.2132]],
            [[267.143,79.7491],[270.842,75.6988],[268.601,72.3941]],
        ] },
    },
    SHOCK: { width: 156, height: 148, strokeWidth: 9.49301, cavityStrokeWidth: 5.93313,
        cavity: { start: [150.805,70.2029], curves: [
            [[150.805,31.3729],[121.593,4.74658],[77.7755,4.74658]],
            [[33.9579,4.74658],[4.74609,31.3729],[4.74609,70.2029]],
            [[4.74609,111.252],[33.9579,142.316],[77.7755,142.316]],
            [[121.593,142.316],[150.805,111.252],[150.805,70.2029]],
        ] },
        tongue: { start: [77.7725,54.6711], curves: [
            [[108.726,54.6711],[135.753,63.4791],[150.22,76.5712]],
            [[152.243,78.4021],[153.123,81.1529],[152.686,83.8463]],
            [[148.674,108.596],[133.713,128.528],[111.445,138.447]],
            [[110.906,138.687],[110.34,138.87],[109.762,138.995]],
            [[99.9076,141.134],[89.1031,142.316],[77.7725,142.316]],
            [[66.4439,142.316],[55.6417,141.134],[45.7883,138.996]],
            [[45.2108,138.871],[44.6452,138.688],[44.1053,138.448]],
            [[21.8354,128.529],[6.87368,108.596],[2.86135,83.8436]],
            [[2.42473,81.1501],[3.30512,78.3991],[5.32846,76.5683]],
            [[19.796,63.4777],[46.8209,54.6712],[77.7725,54.6711]],
        ] },
        outline: { start: [77.7755,4.74658], curves: [
            [[121.593,4.74658],[150.805,31.3729],[150.805,70.2029]],
            [[150.805,111.252],[121.593,142.316],[77.7755,142.316]],
            [[33.9579,142.316],[4.74609,111.252],[4.74609,70.2029]],
            [[4.74609,31.3729],[33.9579,4.74658],[77.7755,4.74658]],
        ] },
    },
    THINKING: { width: 271, height: 52, strokeWidth: 8, cavityStrokeWidth: 5,
        cavity: { start: [11.3555,44], curves: [
            [[34.0394,17],[81.4694,4],[135.086,4]],
            [[188.702,4],[236.132,17],[258.816,44]],
            [[215.511,32],[176.329,29],[135.086,29]],
            [[93.8424,29],[54.6611,32],[11.3555,44]],
        ] },
        tongue: null,
        outline: { start: [11.3555,44], curves: [
            [[34.0394,17],[81.4694,4],[135.086,4]],
            [[188.702,4],[236.132,17],[258.816,44]],
            [[215.511,32],[176.329,29],[135.086,29]],
            [[93.8424,29],[54.6611,32],[11.3555,44]],
        ] },
    },
} as const;

function normalize(c: MouthContour, width: number, height: number): MouthContour {
    const point = ([x, y]: readonly [number, number]): readonly [number, number] => Object.freeze([x / width, y / height]);
    return Object.freeze({ start: point(c.start), curves: Object.freeze(c.curves.map(([a, b, end]) => Object.freeze([point(a), point(b), point(end)] as const))) });
}
function preset(value: typeof measured[keyof typeof measured]): MouthGeometry {
    return Object.freeze({ width: value.width, height: value.height, strokeWidth: value.strokeWidth, cavityStrokeWidth: value.cavityStrokeWidth,
        cavity: normalize(value.cavity, value.width, value.height),
        tongue: value.tongue ? normalize(value.tongue, value.width, value.height) : null,
        outline: normalize(value.outline, value.width, value.height) });
}
// Approved SAD and CRY SVGs are byte-identical; preserve separate preset objects.
export const ADDITIONAL_MOUTH_PRESETS = Object.freeze({ SAD: preset(measured.SAD), CRY: preset(measured.SAD), SHOCK: preset(measured.SHOCK), THINKING: preset(measured.THINKING) });
