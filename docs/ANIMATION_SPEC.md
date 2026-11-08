# ANIMATION SPEC

Initial scaffold uses simple SVG placeholder face. Production animation assets and viseme-by-expression mapping are future work.

Settled `cry` effects use `cry-effect-flow.svg`: a 1.8-second loop sends small ripples down the tear-strip sides while keeping the eye attachment and rounded bottom fixed. Native SVG/CSS animation makes no per-frame React/store updates. Entry reveal and exit drainage retain the original static `cry-effect.svg`; `prefers-reduced-motion: reduce` restores its original path for the settled effect too. Eye/mouth geometry, tear placement, and the JSON protocol are unchanged.

Procedural transitions between `happier`, `sad`, and `cry` keep the mouth on its direct source-to-target morph and placement for the full requested duration, independently of cry eye/tear staging. `sad` and `cry` share the same mouth artwork, so that pair keeps the mouth unchanged. No idle mouth is inserted. For `happier` ↔ `cry`, eye morphing uses 80% of the duration and tear reveal/drainage 20%, replacing the previous 60%/40% split. At 700 ms the two eye legs each receive 280 ms instead of 210 ms; the mouth uses all 700 ms. Other pairs retain their existing eye/tear schedule. Zero duration and reduced motion still settle immediately; protocol and canonical artwork are unchanged.
