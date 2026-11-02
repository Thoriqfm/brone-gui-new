import type { Emotion } from "../../schemas/faceMessages";

const assetPath = `${import.meta.env.BASE_URL}assets/expressions/production/`;

export const EXPRESSION_ASSETS = {
    idle: `${assetPath}idle.webp`,
    happy: `${assetPath}happy.webp`,
    happier: `${assetPath}happier.webp`,
    sad: `${assetPath}sad.webp`,
    cry: `${assetPath}cry.webp`,
    shock: `${assetPath}shock.webp`,
    thinking: `${assetPath}thinking.webp`,
} satisfies Record<Emotion, string>;

// production/happier-transition.webp is reserved for transitions, not an emotion.
