"""Read-only source analysis; writes measurements/previews under reports only.

Tooling: Pillow, numpy, resvg-py. No application dependencies required.
"""
import hashlib
import io
import json
from pathlib import Path
import xml.etree.ElementTree as ET

import numpy as np
from PIL import Image, ImageDraw
import resvg_py

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "public/assets/face-layers"
REPORT = ROOT / "reports/face-layers"
NAMES = ["idle", "happy", "happier", "happier-transition", "sad", "cry", "shock", "thinking"]


def raster(relative, scale=1):
    return Image.open(io.BytesIO(resvg_py.svg_to_bytes(svg_path=str(ASSETS / relative), zoom=scale))).convert("RGBA")


def correlate(a, b):
    shape = (a.shape[0] + b.shape[0] - 1, a.shape[1] + b.shape[1] - 1)
    c = np.fft.irfft2(np.fft.rfft2(a, s=shape) * np.fft.rfft2(b[::-1, ::-1], s=shape), s=shape)
    return c[b.shape[0]-1:a.shape[0], b.shape[1]-1:a.shape[1]]


def match(reference, relative, region, scale=1):
    image = raster(relative, scale)
    template = np.asarray(image, dtype=float) / 255
    alpha = template[:, :, 3]
    # Composite over the known base color, then compare only SVG coverage.
    rgb = template[:, :, :3] * alpha[:, :, None] + np.array([203, 216, 226]) / 255 * (1-alpha[:, :, None])
    x0, y0, x1, y1 = region
    target = np.asarray(reference.convert("RGB"), dtype=float)[y0:y1, x0:x1] / 255
    score = sum(correlate(target[:, :, c] ** 2, alpha) - 2 * correlate(target[:, :, c], alpha * rgb[:, :, c]) for c in range(3))
    score += (rgb ** 2 * alpha[:, :, None]).sum()
    score /= alpha.sum() * 3
    y, x = np.unravel_index(np.argmin(score), score.shape)
    return {"x": int(x+x0), "y": int(y+y0), "width": image.width, "height": image.height,
            "rmse": round(float(np.sqrt(max(0, score[y, x]))), 5)}


def main():
    REPORT.mkdir(parents=True, exist_ok=True)
    inventory = []
    sheet = Image.new("RGB", (1000, 7*190), "#CBD8E2")
    draw = ImageDraw.Draw(sheet)
    for i, path in enumerate(sorted(ASSETS.rglob("*.svg"))):
        node = ET.parse(path).getroot()
        relative = path.relative_to(ASSETS).as_posix()
        inventory.append({"file": relative, "viewBox": node.attrib["viewBox"],
                          "width": float(node.attrib["width"]), "height": float(node.attrib["height"]),
                          "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
        thumb = raster(relative)
        thumb.thumbnail((240, 150))
        x, y = (i % 4) * 250, (i // 4) * 190
        sheet.paste(thumb, (x, y+30), thumb)
        draw.text((x+3, y+5), relative, fill="black")
    sheet.save(REPORT / "svg-inventory.png")
    measurements = {}
    for name in NAMES:
        reference = Image.open(ROOT / f"public/assets/expressions/{name}.png").convert("RGBA").resize((800, 480), Image.Resampling.LANCZOS)
        mouth = "happier" if name in ("happy", "happier-transition") else name
        eyes = "idle" if name == "happy" else name
        parts = [("leftEye", f"eyes/left/{eyes}-eye-left.svg", (70, 130, 300, 350)),
                 ("rightEye", f"eyes/right/{eyes}-eye-right.svg", (510, 130, 760, 360)),
                 ("mouth", f"mouth/{mouth}-mouth.svg", (220, 230, 580, 480))]
        if name == "happier":
            parts += [("blushLeft", "effects/blushing.svg", (100, 260, 260, 340)),
                      ("blushRight", "effects/blushing.svg", (540, 260, 700, 340)),
                      ("blushLineLeft", "effects/line-for-blushing.svg", (100, 240, 260, 320)),
                      ("blushLineRight", "effects/line-for-blushing.svg", (540, 240, 700, 320))]
        if name == "cry":
            parts += [("tearLeft", "effects/cry-effect.svg", (100, 200, 260, 480)),
                      ("tearRight", "effects/cry-effect.svg", (540, 200, 700, 480))]
        if name in ("shock", "thinking"):
            parts += [("mark", f"effects/{'shock-effect' if name == 'shock' else 'question-mark'}.svg", (660, 30, 790, 170))]
        measurements[name] = {key: {"asset": asset, **match(reference, asset, roi)} for key, asset, roi in parts}
    reference = np.asarray(Image.open(ROOT / "public/assets/expressions/idle.png").convert("RGB").resize((800, 480), Image.Resampling.LANCZOS), dtype=float) / 255
    lines = raster("base/face-lines.svg")
    visible = np.ones((480, 800))
    visible[140:330, 100:250] = 0
    visible[140:330, 540:700] = 0
    candidates = []
    for x in range(-135, -124):
        for y in range(-10, 11):
            canvas = Image.new("RGBA", (800, 480))
            canvas.paste(lines, (x, y))
            pixels = np.asarray(canvas, dtype=float) / 255
            alpha = pixels[:, :, 3]
            rgb = pixels[:, :, :3] * alpha[:, :, None] + np.array([203, 216, 226]) / 255 * (1-alpha[:, :, None])
            mask = alpha * visible
            score = (((reference-rgb)**2).sum(axis=2)*mask).sum()/mask.sum()
            candidates.append((float(score), x, y))
    score, x, y = min(candidates)
    line_position = {"x": x, "y": y, "width": 1060, "height": 274, "rmse": round(float(np.sqrt(score/3)), 5)}
    data = {"method": "Alpha-weighted RGB template matching at native SVG scale, against masters reduced to 800x480. ROI constrained by visual reference. RMSE normalized 0..1; not a parity threshold. Lines fitted at native scale with negative offset, excluding eye occlusion.",
            "inventory": inventory, "measurements": measurements, "faceLines": line_position}
    (REPORT / "analysis.json").write_text(json.dumps(data, indent=2) + "\n")
    print(json.dumps({"measurements": measurements, "faceLines": line_position}, indent=2))


if __name__ == "__main__":
    main()
