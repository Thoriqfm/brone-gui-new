import { FACE_LAYER_ASSETS, LAYER_EXPRESSIONS } from "../config/faceLayerAssets";
import { EYE_EXPRESSIONS } from "../geometry/eyes";
import { generateMorphAwareBlinkGeometry } from "../geometry/eyes/blink";
import { sampleProductionGeometry } from "./productionGeometry";
import { loadAnimeDriver } from "./animationEngine";

let preparation: Promise<void> | undefined;
// Reuse the normal samplers so every prepared correspondence lands in the
// same caches used by playback. No animations or semantic state changes.
export function prepareFaceRenderer(): Promise<void> {
    return preparation ??= prepare();
}
async function prepare(): Promise<void> {
    const yieldToBrowser = () => new Promise<void>(resolve => setTimeout(resolve, 0));
    await yieldToBrowser();
    const assets = typeof Image === "undefined" ? Promise.resolve() : Promise.allSettled(
        [...new Set(Object.values(FACE_LAYER_ASSETS).flatMap(asset =>
            [asset.src, ...("animatedSrc" in asset ? [asset.animatedSrc] : [])]))].map(async src => {
            const image = new Image();
            image.src = src;
            await image.decode();
        }),
    );
    await loadAnimeDriver();
    for (const from of LAYER_EXPRESSIONS) for (const to of LAYER_EXPRESSIONS) {
        if (from === to) continue;
        // Both halves cover eye routes through Idle, plus direct mouth pairs.
        sampleProductionGeometry(from, to, .25);
        sampleProductionGeometry(from, to, .75);
        await yieldToBrowser();
    }
    for (const expression of EYE_EXPRESSIONS) {
        for (const side of ["left", "right"] as const) generateMorphAwareBlinkGeometry({
            from: expression, to: expression, side, morphProgress: 0, blinkProgress: .5,
        });
        await yieldToBrowser();
    }
    // A failed asset still follows the renderer's existing decode fallback.
    await assets;
}
