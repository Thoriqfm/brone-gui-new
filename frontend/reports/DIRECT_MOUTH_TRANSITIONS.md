# Direct mouth transitions

The procedural production renderer previously routed distinct non-Idle mouths
through Idle at progress 0.5. Shock → Thinking therefore visibly became Idle
before reaching Thinking. Mouth placement also followed that two-leg route.

`geometry/mouth/expressionPresets.ts` now samples direct expression pairs using
the existing landmark alignment and exact cubic subdivision helpers. Prepared
contour pairs are cached in both directions. Thinking's missing tongue uses a
collapsed contour with interpolated opacity; intermediate tongues stay clipped.
Existing Idle routes and canonical endpoint objects are preserved.

`animation/productionGeometry.ts` uses this sampler and interpolates mouth
placement directly across the requested duration. Identical Happy/Happier and
Sad/Cry mouths remain unchanged. The comparison panel labels the new behavior.
Eye routing, effect fades, source artwork, backend and protocol are unchanged.

Verification on the development host:

- PASS: `npm run typecheck` and `npm run build`.
- PASS: `node scripts/verify-mouth-expressions.mjs`: all 30 directed mouth pairs,
  endpoint identity/source-curve preservation, 19 intermediate samples per pair,
  sampled contour self-intersection checks, reverse symmetry and invalid inputs.
- PASS: `node scripts/verify-production-renderer.mjs`: all 42 directed face
  transitions, 462 DOM/React SVG samples, direct dimensions/placement assertions,
  existing renderer lifecycle and controller checks. Its generated route sheet
  now includes Shock → Thinking and Thinking → Shock.
- PASS: `node scripts/verify-mouth-morphing.mjs`.
- PASS: `node scripts/verify-expression-transitions.mjs`.
- PASS: `node scripts/verify-morph-aware-blinking.mjs`.

Live browser playback and target-display visual review were not run. An attempt
to rasterize the generated SVG sheet could not run because the available
`resvg_py` module lacks `svg_to_bytes`; no raster parity claim is made.
Backend health/WebSocket checks were not run because this changes only frontend
visual interpolation. No performance measurements were collected.

Next review: select Procedural renderer in Production renderer comparison and
inspect Shock ↔ Thinking plus the other pairs at 1000 ms and 300 ms. Rapid
replacement still follows the existing coordinator policy, which can settle to
the previous target before beginning the next transition.
