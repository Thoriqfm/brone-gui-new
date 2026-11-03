"""Render timeout placement and opposing quarter turns from runtime-config.json.

Run verify-face-layers.mjs first; tooling only: Pillow, resvg-py.
This is a static diagnostic, not proof of browser animation timing.
"""
import base64
import io
import json
from pathlib import Path

from PIL import Image, ImageDraw
import resvg_py

root = Path(__file__).resolve().parents[1]
config = json.loads((root / "reports/face-layers/runtime-config.json").read_text())
layout = config["layouts"]["timeout"]
composition = config["compositions"]["timeout"]
output = root / "reports/timeout"
output.mkdir(parents=True, exist_ok=True)
sheet = Image.new("RGB", (1600, 1020), "#080f1d")
draw = ImageDraw.Draw(sheet)
for index, angle in enumerate((0, 90, 180, 270)):
    layers = []
    for role in ("faceBase", "faceLines", "leftEye", "rightEye", "mouth"):
        key = composition.get(role, role)
        asset = config["assets"][key]
        p = layout[role]
        data = base64.b64encode((root / "public" / asset["src"].lstrip("/")).read_bytes()).decode()
        rotation = angle if role == "leftEye" else -angle if role == "rightEye" else 0
        layers.append(f'<image x="{p["x"]}" y="{p["y"]}" width="{p["width"]}" height="{p["height"]}" transform="rotate({rotation} {p["x"] + p["width"]/2} {p["y"] + p["height"]/2})" href="data:image/svg+xml;base64,{data}"/>')
    svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="480">' + ''.join(layers) + '</svg>'
    image = Image.open(io.BytesIO(resvg_py.svg_to_bytes(svg_string=svg))).convert("RGBA")
    image.save(output / f"timeout-{angle}.png")
    x, y = index % 2 * 800, index // 2 * 510
    sheet.paste(image, (x, y + 30), image)
    draw.text((x + 8, y + 8), f"Left {angle} deg / right {-angle} deg", fill="white")
sheet.save(output / "rotation-grid.png")
print("Rendered timeout placement and four opposing rotation samples; browser timing unverified.")

# These SVGs come from the actual TypeScript sampler and React renderer.
frames_path = output / "morph-frames.json"
if frames_path.exists():
    frames = json.loads(frames_path.read_text())
    pairs = list(dict.fromkeys((f["from"], f["to"]) for f in frames))
    overview = Image.new("RGB", (2000, len(pairs) * 270), "#080f1d")
    for row, pair in enumerate(pairs):
        strip = Image.new("RGB", (2000, 270), "#080f1d")
        ImageDraw.Draw(strip).text((8, 4), f"{pair[0]} -> {pair[1]}", fill="white")
        for col, frame in enumerate(f for f in frames if (f["from"], f["to"]) == pair):
            parts = []
            for role in ("faceBase", "faceLines", "leftEye", "rightEye", "mouth"):
                p = frame["layout"][role]
                if role in ("faceBase", "faceLines"):
                    data = (root / "public" / config["assets"][role]["src"].lstrip("/")).read_bytes()
                else:
                    data = frame[{"leftEye": "left", "rightEye": "right", "mouth": "mouth"}[role]].encode()
                encoded = base64.b64encode(data).decode()
                parts.append(f'<image x="{p["x"]}" y="{p["y"]}" width="{p["width"]}" height="{p["height"]}" href="data:image/svg+xml;base64,{encoded}"/>')
            svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="480">' + ''.join(parts) + '</svg>'
            sample = Image.open(io.BytesIO(resvg_py.svg_to_bytes(svg_string=svg))).convert("RGBA")
            strip.paste(sample.resize((400, 240)), (col * 400, 26))
            ImageDraw.Draw(strip).text((col * 400 + 8, 14), str(frame["p"]), fill="white")
        strip.save(output / f"morph-{pair[0]}-{pair[1]}.png")
        overview.paste(strip, (0, row * 270))
    overview.save(output / "morph-grid.png")
    print("Rendered 14 timeout morph timelines from production sampler/React SVGs.")
