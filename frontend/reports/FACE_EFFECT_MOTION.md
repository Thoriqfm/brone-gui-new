# Face effect motion

Implemented for both asset and procedural renderers, using the existing face
transition progress and requested duration. No dependencies or artwork changed.

- Happier: cheeks and their black lines fade in together after the first 15% of
  the transition, scaling from 95% to 100% around a shared pivot per cheek.
  Exit fades gently without shrinking; settled blush stays still.
- Cry (revised): eyes, internal eye water and mouth finish their transition in
  the first 60% of entrance time. Only then does the external tear strip reveal
  from its upper origin downward during the remaining 40%. On exit the cry face
  stays unchanged for the first 40% while the tear image slides downward inside
  its fixed clipping window until entirely gone. The remaining 60% changes the
  eyes/mouth to the destination. Opacity stays 1; the exit never retracts upward.
  Full tears remain still. Both phases fit the requested total duration.
- Shock: fast entrance with one 80% → 108% → 100% scale overshoot; fast fade and
  slight shrink on exit. Settled punctuation stays still.
- Thinking: delayed fade and 5 logical units of upward entrance travel; exits
  downward with a fade. Settled '?' floats up by about 2.5 logical units over a
  2.6-second cycle. CSS disables this loop for reduced motion.
- Shock ↔ Thinking: outgoing punctuation disappears by 40% progress; incoming
  punctuation begins after 45%, in both directions.

`src/animation/faceEffectMotion.ts` owns sampling and DOM style updates.
`FaceEffects.tsx` adds optional motion wrappers without changing its existing
static rendering API. `GeometryTransitionLayer.tsx` applies the sampler directly
to source/target effects. `ExpressionTransitionLayer.tsx` places asset effects
outside the face opacity animation, preventing inherited fading of tears.
`FaceRenderer.tsx` passes effect phase/context and `expressionTransition.ts`
delivers normalized progress to both asset effect callbacks. Existing readiness,
cancellation, immediate updates, and reduced-motion settlement remain in use.
`style.css` supplies only the settled Thinking float. Comparison text was updated.

The cry revision adds shared `sampleFaceTransitionProgress` timing. Procedural
geometry and its blink context use this staged progress. Asset cry crossfades
animate a linear `data-progress` attribute, then derive face opacity and effect
progress separately, keeping the cry face fully visible until external tears
have drained. The canonical store still records the requested destination
immediately; this is a visual sequence, with no protocol/state-delivery change.

Verification:

- PASS: `npm run typecheck`, `npm run build`.
- PASS: `node scripts/verify-face-effect-motion.mjs`: 8,484 samples across all
  directed canonical pairs and both phases; delayed tear reveal/downward drainage,
  fixed clipping window and opacity, cheek pivots, punctuation handoff, actual
  geometry/asset component callbacks, frame detachment, coordinator progress,
  zero-duration settlement, stale callback rejection and store isolation.
  The revised suite checks all 12 Cry directions against actual eye/water and
  mouth SVG output, and all 12 staged asset coordinator opacity sequences.
- PASS: production renderer (42 directed morphs / 462 DOM samples), face layers,
  expression controller, expression transitions and animation engine scripts.
- PASS: morph-aware blinking, eye-expression blinking and eye-Sad morph scripts.
- PASS: `git diff --check`.

Layer verification now checks the positioned wrapper's z-index instead of the
unpositioned child image. The integrity migration retains previous hashes and
records the two changed renderer/coordinator hashes. It also records the already
authorized direct-mouth sampler/export changes from the preceding task; original
geometry/blink baseline files and endpoint assertions remain unchanged.

Live Chrome inspection was attempted through the computer-use skill and rejected
by automatic approval: "Computer Use was not approved to use Google Chrome".
Browser playback, native clipping/rendering, perceived timing, reduced-motion
visual behavior and robot-display performance therefore remain unverified.
The checks above use SSR, a bounded DOM fixture, and actual frame callbacks;
they do not establish browser scheduling or visual quality. Backend/manual health
checks were not run; this task changes no backend or protocol behavior.

Next: inspect Cry ↔ other expressions and Shock ↔ Thinking at 300/1000 ms in
Production renderer comparison, including rapid replacement and reduced motion.
The existing geometry interruption policy can still settle to the old target
before starting a replacement; this task does not change that policy.
