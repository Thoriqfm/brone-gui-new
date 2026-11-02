"""Validate shared emotion fixtures against the actual Python protocol model.

Run with the backend virtualenv Python; no additional dependencies required.
"""
import json
from pathlib import Path
import sys
from typing import get_args

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.schemas.messages import Emotion, ExpressionMessage
from pydantic import ValidationError

schema = json.loads((ROOT / "shared/face-protocol.schema.json").read_text())
assert list(get_args(Emotion)) == schema["properties"]["payload"]["properties"]["emotion"]["enum"]
fixtures = json.loads((ROOT / "frontend/scripts/fixtures/expression-messages.json").read_text())
for fixture in fixtures:
    try:
        ExpressionMessage.model_validate(fixture["message"])
        valid = True
    except ValidationError:
        valid = False
    assert valid == fixture["valid"], fixture["name"]
print(f"PASS: Python/shared emotion enum parity and {len(fixtures)} expression fixtures.")
