# PROTOCOL

v0.1 message: SET_EXPRESSION; request_id string; payload with emotion, intensity (0..1), transition_ms. More message types are planned.

Finalized expressions: idle, happy, happier, sad, cry, shock, thinking. The shy expression is intentionally excluded from the finalized design and is rejected, without an idle fallback. happier-transition remains a frontend-only static preview, not a protocol emotion.
