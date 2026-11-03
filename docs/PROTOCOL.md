# PROTOCOL

v0.1 message: SET_EXPRESSION; request_id string; payload with emotion, intensity (0..1), transition_ms. More message types are planned.

Finalized expressions: idle, happy, happier, sad, cry, shock, thinking, timeout. The shy expression is intentionally excluded from the finalized design and is rejected, without an idle fallback. happier-transition remains a frontend-only static preview, not a protocol emotion.

`timeout` represents an unavailable or nonresponding LLM. Send it through the existing `SET_EXPRESSION` command. Both renderers morph eyes and mouth into and out of timeout, retaining the original SVGs at rest. Eyes route through Idle when needed; the mouth morphs directly. Spiral rotation runs in opposing directions (one turn per 2.4 seconds), resumes at the end of entry, and carries its visible angle into the exit morph. Timeout morphs suspend blinking. Reduced-motion preference disables rotation and makes transitions immediate. Manual preview: key 8 or the timeout control. No LLM health detection or automatic timeout trigger exists yet; the command producer must select timeout and a recovery expression explicitly.
