# Production expression assets

Eight 3200 x 1920 RGBA PNG masters remain in `public/assets/expressions/`.
Derivatives are in its `production/` subdirectory: PNG and lossless WebP,
both 1490 x 894 (the same 5:3 aspect ratio). No crop or stretch is applied.

Regenerate with `python scripts/prepare-expression-assets.py` in an environment
with Pillow and WebP support. No application dependency was added.
This run used Pillow 13.0.0 and libwebp 1.6.0, Lanczos resampling with
premultiplied alpha, optimized PNG level 9, and lossless exact WebP method 6.
The script checks unchanged master SHA-256 hashes before/after generation,
dimensions, transparent corners, partial alpha, and exact decoded RGBA equality
between the resize reference, PNG, and WebP. Exact hashes/sizes are recorded in
`comparison.json`.

| Asset | Master PNG bytes | Resized PNG bytes | Lossless WebP bytes |
| --- | ---: | ---: | ---: |
| idle | 262696 | 159434 | 86952 |
| happy | 271386 | 168134 | 90128 |
| happier | 233969 | 159046 | 86298 |
| sad | 285232 | 147725 | 77852 |
| cry | 442888 | 186481 | 101648 |
| shock | 273610 | 174511 | 95366 |
| thinking | 325402 | 160512 | 83162 |
| happier-transition | 241904 | 146395 | 80440 |
| Total | 2337087 | 1302238 | 701846 |

WebP was selected on measured evidence: 600392 fewer bytes (46.10%) than
resized PNG, with identical decoded RGBA pixels for every asset. Both remain
available. No lossy compression was used. The transition is not mapped as an
emotion. Shy is intentionally excluded from the finalized design and has no fallback.

`visual-comparison.png` compares every scaled master with its PNG and WebP
derivatives. `corner-detail.png` magnifies the idle corner and outline.
Visual inspection found matching colors, gradients, outlines, and transparent
corners. Resampling necessarily removes fine detail relative to the master;
lossless encoding adds no further difference relative to the resized reference.

RGBA estimates (width x height x 4; not measured browser memory):

| Resident pixel buffers | Masters MiB | Derivatives MiB |
| --- | ---: | ---: |
| One | 23.44 | 5.08 |
| Seven expressions | 164.06 | 35.57 |
| All eight | 187.50 | 40.65 |

## Rendering and loading

The renderer reserves a responsive 1490:960 canvas, centered at a maximum
width of 1490 CSS pixels. The 1490:894 image uses object-fit contain; at full
size it has 33 CSS pixels of space above and below. Image dimensions and
canvas aspect ratio reserve layout before decoding. The development header
and controls remain outside the canvas, so this page is not a fullscreen kiosk.

Zustand still initializes idle. Only the selected image is requested, eagerly;
there is no preload loop, cache-busting URL, or custom image cache. Stable URLs
allow normal HTTP caching according to hosting headers. Production cache policy
is not configured here; fixed filenames should be revalidated when replaced,
rather than given permanent immutable caching.

index.html has width=device-width, initial-scale=1.0. No DPR override, srcset,
or DPR-dependent resolution selection exists. 1490 physical pixels corresponds
to 1490 CSS pixels only at DPR 1 with the expected browser zoom. Browser access
was unavailable, so live DPR/viewport, layout shifts, switching latency, browser
WebP decoding, and target-device memory/timing remain unmeasured. Validate on
the Brone display; a higher DPR at the same CSS width may need larger assets.

Both masters and derivative formats are retained under public, and therefore
are copied by Vite into dist. They increase package size but are not all
downloaded by this renderer. No runtime performance improvement is claimed.
