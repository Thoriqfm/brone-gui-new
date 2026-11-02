"""Render comparison artifacts from the verified TypeScript runtime config.

Run verify-face-layers.mjs first. Tooling only: Pillow, numpy, resvg-py.
"""
import hashlib
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageChops
import resvg_py

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "reports/face-layers"


def main():
    config = json.loads((REPORT / "runtime-config.json").read_text())
    analysis = json.loads((REPORT / "analysis.json").read_text())
    for item in analysis["inventory"]:
        source = ROOT / "public/assets/face-layers" / item["file"]
        assert hashlib.sha256(source.read_bytes()).hexdigest() == item["sha256"]
    master_report = json.loads((ROOT / "reports/expression-assets/comparison.json").read_text())
    for item in master_report["assets"]:
        master = ROOT / f"public/assets/expressions/{item['name']}.png"
        assert hashlib.sha256(master.read_bytes()).hexdigest() == item["master_sha256"]
    sheet = Image.new("RGB", (1200, len(config["compositions"]) * 286), "#080f1d")
    draw = ImageDraw.Draw(sheet)
    results = []
    for row, (expression, composition) in enumerate(config["compositions"].items()):
        layout = config["layouts"][expression]
        parts = [("faceBase", layout["faceBase"], config["order"]["faceBase"]),
                 ("faceLines", layout["faceLines"], config["order"]["faceLines"]),
                 (composition["leftEye"], layout["leftEye"], config["order"]["eyes"]),
                 (composition["rightEye"], layout["rightEye"], config["order"]["eyes"]),
                 (composition["mouth"], layout["mouth"], config["order"]["mouth"])]
        parts += [(effect["asset"], layout["effects"][effect["id"]], config["order"][effect["order"]]) for effect in composition["effects"]]
        # Render the same percentage-based composition at two widths to inspect scaling.
        for width in (800, 1490):
            scale = width / 800
            height = round(width * 960 / 1490)
            top = (height - round(480*scale)) // 2
            composed = Image.new("RGBA", (width, height))
            for key, position, order in sorted(parts, key=lambda part: part[2]):
                asset = config["assets"][key]
                svg = ROOT / "public" / asset["src"].lstrip("/")
                image = Image.open(io.BytesIO(resvg_py.svg_to_bytes(svg_path=str(svg), zoom=scale))).convert("RGBA")
                layer = Image.new("RGBA", composed.size)
                layer.paste(image, (round(position["x"]*scale), top+round(position["y"]*scale)))
                composed = Image.alpha_composite(composed, layer)
            reference = Image.new("RGBA", composed.size)
            master = Image.open(ROOT / f"public/assets/expressions/{expression}.png").convert("RGBA")
            reference.paste(master.resize((width, round(480*scale)), Image.Resampling.LANCZOS), (0, top))
            composed.save(REPORT / f"{expression}-{width}.png")
            if width == 800:
                background = Image.new("RGBA", composed.size, "#080f1d")
                a = Image.alpha_composite(background, reference).convert("RGB")
                b = Image.alpha_composite(background, composed).convert("RGB")
                rmse = float(np.sqrt(np.mean((np.asarray(a, dtype=float)-np.asarray(b, dtype=float))**2)))
                difference = ImageChops.difference(a, b)
                for column, (label, image) in enumerate((("Master", a), ("Layers", b), ("Absolute difference", difference))):
                    preview = image.resize((400, round(height/2)), Image.Resampling.LANCZOS)
                    sheet.paste(preview, (column*400, row*286+24))
                    draw.text((column*400+4, row*286+4), f"{expression}: {label}", fill="white")
                results.append({"expression": expression, "composite_rgb_rmse_0_to_255": round(rmse, 3)})
    sheet.save(REPORT / "composition-comparison.png")
    (REPORT / "visual-results.json").write_text(json.dumps(results, indent=2)+"\n")
    print(json.dumps(results, indent=2))
    print("PASS: source SVG and PNG hashes unchanged; all configured SVGs rasterized at widths 800 and 1490.")


if __name__ == "__main__":
    main()
