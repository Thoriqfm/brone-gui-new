import { ADDITIONAL_MOUTH_PRESETS } from "./sourcePresets";
import type { MouthContour, MouthGeometry, MouthPoint } from "./types";

// Measured absolute control points from the approved idle/happier mouth SVGs.
// Normalize once; rendering and future parameter updates share the same model.
const measured = {
    IDLE: { width: 282, height: 96,
        cavity: { start: [268.268,4.11362], curves: [
            [[167.337,21.6633],[108.054,22.5806],[13.1673,4.57189]],
            [[7.87086,3.56667],[3.06074,7.95085],[4.17288,13.2259]],
            [[14.8465,63.8521],[61.9916,91.3795],[141.121,91.3795]],
            [[224.195,91.3795],[271.996,53.9894],[277.011,11.7643]],
            [[277.588,6.90955],[273.085,3.27612],[268.268,4.11362]],
        ] },
        tongue: { start: [139.973,38.5593], curves: [
            [[187.954,38.5593],[229.092,45.2687],[246.472,54.8134]],
            [[250.377,56.9578],[250.212,62.0349],[246.646,64.7056]],
            [[245.987,65.1992],[245.318,65.6879],[244.641,66.1716]],
            [[230.922,75.9616],[213.387,83.7218],[192.298,88.5105]],
            [[176.593,90.3443],[158.81,91.3796],[139.973,91.3796]],
            [[119.967,91.3796],[101.151,90.2118],[84.751,88.1599]],
            [[67.7379,84.2607],[53.1172,78.3866],[41.0127,70.5847]],
            [[38.1523,68.7411],[35.4356,66.791],[32.8634,64.7368]],
            [[29.4782,62.0333],[29.3928,57.0966],[33.1728,54.98]],
            [[50.3758,45.3469],[91.7126,38.5594],[139.973,38.5593]],
        ] },
    },
    HAPPY: { width: 282, height: 155,
        cavity: { start: [267.864,4.3203], curves: [
            [[167.749,33.41],[108.584,34.8994],[14.37,5.00488]],
            [[8.9624,3.28903],[3.46273,7.53373],[4.04385,13.1772]],
            [[13.1884,101.984],[60.6769,150.372],[141.694,150.372]],
            [[226.707,150.372],[274.782,84.7102],[277.865,11.8921]],
            [[278.089,6.59431],[272.956,2.84078],[267.864,4.3203]],
        ] },
        tongue: { start: [140.545,61.7982], curves: [
            [[191.758,61.7982],[235.175,74.6155],[250.228,92.3512]],
            [[252.229,94.7088],[252.048,98.1001],[250.196,100.577]],
            [[248.741,102.523],[247.236,104.429],[245.679,106.292]],
            [[229.773,125.327],[208.618,139.875],[182.632,147.329]],
            [[169.593,149.293],[155.397,150.372],[140.545,150.372]],
            [[124.895,150.372],[109.973,149.173],[96.3662,147.004]],
            [[74.3227,140.762],[55.8227,129.584],[41.1045,113.676]],
            [[37.3444,109.612],[33.8385,105.247],[30.5877,100.587]],
            [[28.881,98.1399],[28.7546,94.88],[30.6632,92.5874]],
            [[45.53,74.7294],[89.1045,61.7982],[140.545,61.7982]],
        ] },
    },
} as const;
function normalize(contour: { readonly start: MouthPoint; readonly curves: readonly (readonly MouthPoint[])[] }, width: number, height: number): MouthContour {
    const point = ([x, y]: MouthPoint): MouthPoint => [x / width, y / height];
    return Object.freeze({ start: Object.freeze(point(contour.start)), curves: Object.freeze(contour.curves.map((curve) =>
        Object.freeze([Object.freeze(point(curve[0])), Object.freeze(point(curve[1])), Object.freeze(point(curve[2]))] as const))) });
}
function preset(value: typeof measured.IDLE | typeof measured.HAPPY): MouthGeometry {
    return Object.freeze({ width: value.width, height: value.height, strokeWidth: 8, cavityStrokeWidth: 5,
        cavity: normalize(value.cavity, value.width, value.height),
        tongue: normalize(value.tongue, value.width, value.height) });
}
export const MOUTH_PRESETS = Object.freeze({ IDLE: preset(measured.IDLE), HAPPY: preset(measured.HAPPY), ...ADDITIONAL_MOUTH_PRESETS });
