import type { EyeGeometry } from "./types";
import { SOURCE_EYE_PRESETS } from "./sourcePresets";
import { TIMEOUT_EYES } from "./timeoutSource";

// Measured from both Idle SVGs: identical artwork after Figma reference renaming.
// Native source coordinates; highlights must not be mirrored.
const measured = {
    "width": 129,
    "height": 171,
    "body": {
        "center": [
            64.5,
            85.5
        ],
        "radius": [
            60.5,
            81.5
        ]
    },
    "outline": {
        "start": [
            64.5,
            2.0
        ],
        "curves": [
            [
                [
                    81.9862,
                    2.0
                ],
                [
                    97.657,
                    11.5524
                ],
                [
                    108.886,
                    26.6787
                ]
            ],
            [
                [
                    120.115,
                    41.8052
                ],
                [
                    127.0,
                    62.6083
                ],
                [
                    127.0,
                    85.5
                ]
            ],
            [
                [
                    127.0,
                    108.392
                ],
                [
                    120.115,
                    129.195
                ],
                [
                    108.886,
                    144.321
                ]
            ],
            [
                [
                    97.657,
                    159.448
                ],
                [
                    81.9862,
                    169.0
                ],
                [
                    64.5,
                    169.0
                ]
            ],
            [
                [
                    47.0138,
                    169.0
                ],
                [
                    31.343,
                    159.448
                ],
                [
                    20.1143,
                    144.321
                ]
            ],
            [
                [
                    8.88536,
                    129.195
                ],
                [
                    2.0,
                    108.392
                ],
                [
                    2.0,
                    85.5
                ]
            ],
            [
                [
                    2.0,
                    62.6083
                ],
                [
                    8.88536,
                    41.8052
                ],
                [
                    20.1143,
                    26.6787
                ]
            ],
            [
                [
                    31.343,
                    11.5524
                ],
                [
                    47.0138,
                    2.0
                ],
                [
                    64.5,
                    2.0
                ]
            ]
        ]
    },
    "stroke": "black",
    "strokeWidth": 4,
    "gradient": {
        "start": [
            64.5,
            4.0
        ],
        "end": [
            64.5,
            167.0
        ],
        "stops": [
            {
                "offset": 0.0625,
                "color": "#6260B0"
            },
            {
                "offset": 0.533654,
                "color": "#29284A"
            }
        ]
    },
    "shadow": {
        "region": [
            0.0,
            0.0,
            129.0,
            175.0
        ],
        "offsetY": 4,
        "blur": 2,
        "opacity": 0.25
    },
    "highlights": {
        "ellipse": {
            "center": [
                27.7,
                94.8559
            ],
            "radius": [
                9.2,
                9.6
            ]
        },
        "contour": {
            "start": [
                41.5,
                33.2559
            ],
            "curves": [
                [
                    [
                        54.2025,
                        33.2559
                    ],
                    [
                        64.5,
                        44.001
                    ],
                    [
                        64.5,
                        57.2559
                    ]
                ],
                [
                    [
                        64.5,
                        60.3736
                    ],
                    [
                        63.9293,
                        63.3521
                    ],
                    [
                        62.8926,
                        66.085
                    ]
                ],
                [
                    [
                        61.4671,
                        62.3141
                    ],
                    [
                        57.9464,
                        59.6445
                    ],
                    [
                        53.8262,
                        59.6445
                    ]
                ],
                [
                    [
                        48.4443,
                        59.6446
                    ],
                    [
                        44.0812,
                        64.1976
                    ],
                    [
                        44.0811,
                        69.8135
                    ]
                ],
                [
                    [
                        44.0811,
                        74.1983
                    ],
                    [
                        46.741,
                        77.9346
                    ],
                    [
                        50.4688,
                        79.3623
                    ]
                ],
                [
                    [
                        47.7127,
                        80.5813
                    ],
                    [
                        44.6819,
                        81.2559
                    ],
                    [
                        41.5,
                        81.2559
                    ]
                ],
                [
                    [
                        28.7975,
                        81.2559
                    ],
                    [
                        18.5,
                        70.5107
                    ],
                    [
                        18.5,
                        57.2559
                    ]
                ],
                [
                    [
                        18.5,
                        44.001
                    ],
                    [
                        28.7975,
                        33.2559
                    ],
                    [
                        41.5,
                        33.2559
                    ]
                ]
            ]
        },
        "fill": "white",
        "opacity": 0.96
    }
} as const;
function freeze<T>(value: T): T {
    if (value && typeof value === "object") {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    }
    return value;
}
const IDLE_LEFT = { ...measured, side: "left" } satisfies EyeGeometry;
const IDLE_RIGHT = { ...measured, side: "right" } satisfies EyeGeometry;
export const EYE_PRESETS = /* @__PURE__ */ (() => freeze({ IDLE_LEFT, IDLE_RIGHT,
    HAPPY_LEFT: IDLE_LEFT, HAPPY_RIGHT: IDLE_RIGHT,
    // Shock's separate assets are identical to Idle and its eye layouts match.
    SHOCK_LEFT: IDLE_LEFT, SHOCK_RIGHT: IDLE_RIGHT,
    HAPPIER_LEFT: SOURCE_EYE_PRESETS.HAPPIER_LEFT, HAPPIER_RIGHT: SOURCE_EYE_PRESETS.HAPPIER_RIGHT,
    SAD_LEFT: SOURCE_EYE_PRESETS.SAD_LEFT, SAD_RIGHT: SOURCE_EYE_PRESETS.SAD_RIGHT,
    CRY_LEFT: SOURCE_EYE_PRESETS.CRY_LEFT, CRY_RIGHT: SOURCE_EYE_PRESETS.CRY_RIGHT,
    THINKING_LEFT: SOURCE_EYE_PRESETS.THINKING_LEFT, THINKING_RIGHT: SOURCE_EYE_PRESETS.THINKING_RIGHT,
}))();
const idle = /* @__PURE__ */ (() => freeze({ left: EYE_PRESETS.IDLE_LEFT, right: EYE_PRESETS.IDLE_RIGHT }))();
export const HAPPIER_TRANSITION_PREVIEW = /* @__PURE__ */ (() => freeze({
    left: SOURCE_EYE_PRESETS.HAPPIER_TRANSITION_LEFT, right: SOURCE_EYE_PRESETS.HAPPIER_TRANSITION_RIGHT }))();
// Both eye assets AND layouts match in FACE_LAYER_COMPOSITIONS/FACE_LAYER_LAYOUTS.
export const EYE_EXPRESSION_PRESETS = /* @__PURE__ */ (() => freeze({ idle, happy: idle, shock: idle,
    timeout: TIMEOUT_EYES,
    happier: { left: EYE_PRESETS.HAPPIER_LEFT, right: EYE_PRESETS.HAPPIER_RIGHT },
    "happier-transition": HAPPIER_TRANSITION_PREVIEW,
    sad: { left: EYE_PRESETS.SAD_LEFT, right: EYE_PRESETS.SAD_RIGHT },
    cry: { left: EYE_PRESETS.CRY_LEFT, right: EYE_PRESETS.CRY_RIGHT },
    thinking: { left: EYE_PRESETS.THINKING_LEFT, right: EYE_PRESETS.THINKING_RIGHT },
}))();
export const EYE_EXPRESSIONS = ["idle", "happy", "happier", "sad", "cry", "shock", "thinking"] as const;
export type EyeExpression = (typeof EYE_EXPRESSIONS)[number];
