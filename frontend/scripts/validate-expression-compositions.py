"""Visual evidence from the actual TS configs, without changing source artwork.

Run node scripts/verify-face-layers.mjs first. --candidates previews proposed
translations before adoption. Uses existing Pillow/numpy/resvg-py tooling.
"""
import argparse
import base64
import copy
import hashlib
import io
import json
from pathlib import Path
import xml.etree.ElementTree as ET

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageEnhance
import resvg_py

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "reports/face-decomposition"
ART_TOP = (800 * 960 / 1490 - 480) / 2


def render(config, expression, width):
    composition, layout = config["compositions"][expression], config["layouts"][expression]
    parts = [("faceBase", layout["faceBase"], config["order"]["faceBase"]),
             ("faceLines", layout["faceLines"], config["order"]["faceLines"])]
    parts += [(composition[key], layout[key], config["order"]["mouth" if key == "mouth" else "eyes"]) for key in ("leftEye", "rightEye", "mouth")]
    parts += [(effect["asset"], layout["effects"][effect["id"]], config["order"][effect["order"]]) for effect in composition["effects"]]
    # External SVG image documents isolate their internal IDs, like browser <img>.
    # Fractional x/y remain vector translations rather than rounded pixel pastes.
    images = []
    for key, box, _ in sorted(parts, key=lambda item: item[2]):
        source = ROOT / "public" / config["assets"][key]["src"].lstrip("/")
        data = base64.b64encode(source.read_bytes()).decode()
        image = f'<image x="{box["x"]}" y="{ART_TOP+box["y"]}" width="{box["width"]}" height="{box["height"]}" href="data:image/svg+xml;base64,{data}"/>'
        if key == "faceLines":
            image = f'<g clip-path="url(#lines-window)">{image}</g>'
        images.append(image)
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{round(width*960/1490)}" viewBox="0 0 800 {800*960/1490}"><defs><clipPath id="lines-window"><rect x="0" y="{ART_TOP}" width="800" height="480"/></clipPath></defs>{"".join(images)}</svg>'
    return Image.open(io.BytesIO(resvg_py.svg_to_bytes(svg_string=svg))).convert("RGBA")


def flatten(image):
    return Image.alpha_composite(Image.new("RGBA", image.size, "#080f1d"), image).convert("RGB")


def render_reference(expression, width):
    # Use the same fractional artwork origin as the vector composition. An
    # integer PNG paste would bias narrow-viewport comparisons by half a pixel.
    master = ROOT / f"public/assets/expressions/{expression}.png"
    data = base64.b64encode(master.read_bytes()).decode()
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{round(width*960/1490)}" viewBox="0 0 800 {800*960/1490}"><image x="0" y="{ART_TOP}" width="800" height="480" href="data:image/png;base64,{data}"/></svg>'
    return Image.open(io.BytesIO(resvg_py.svg_to_bytes(svg_string=svg))).convert("RGBA")


def rmse(a, b):
    return round(float(np.sqrt(np.mean((np.asarray(a, dtype=float)-np.asarray(b, dtype=float))**2))), 4)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidates", action="store_true")
    args = parser.parse_args()
    evidence = json.loads((OUT / "coordinate-candidates.json").read_text())
    for relative, digest in evidence["source_hashes"].items():
        assert hashlib.sha256((ROOT / relative).read_bytes()).hexdigest() == digest, relative
    config = json.loads((ROOT / "reports/face-layers/runtime-config.json").read_text())
    baseline = json.loads((OUT / "baseline-config.json").read_text())
    if args.candidates:
        config = copy.deepcopy(config)
        for expression, parts in evidence["candidates"].items():
            for part, measurement in parts.items():
                if part == "faceLines":
                    for layout in config["layouts"].values():
                        layout[part] = measurement["candidate"]
                elif part.startswith("effects."):
                    config["layouts"][expression]["effects"][part.split(".")[1]] = measurement["candidate"]
                else:
                    config["layouts"][expression][part] = measurement["candidate"]
    prefix = "candidates-" if args.candidates else ""
    sheet = Image.new("RGB", (1200, len(config["compositions"])*286), "#080f1d")
    draw = ImageDraw.Draw(sheet)
    results = []
    for row, expression in enumerate(config["compositions"]):
        for width in (800, 1490):
            image = render(config, expression, width)
            before = render(baseline, expression, width)
            reference = render_reference(expression, width)
            reference, before, after = map(flatten, (reference, before, image))
            image.save(OUT / f"{prefix}{expression}-{width}.png")
            difference = ImageEnhance.Brightness(ImageChops.difference(reference, after)).enhance(4)
            # One full target-size strip per expression for detailed inspection.
            if width == 1490:
                detail = Image.new("RGB", (width*3, 984), "#080f1d")
                detail_draw = ImageDraw.Draw(detail)
                for column, (label, panel) in enumerate((("PNG master", reference), ("Composed SVG", after), ("Difference x4", difference))):
                    detail.paste(panel, (column*width, 24))
                    detail_draw.text((column*width+8, 6), f"{expression}: {label}", fill="white")
                detail.save(OUT / f"{prefix}{expression}-detail.png")
            if width == 800:
                for column, (label, panel) in enumerate((("Master", reference), ("Before", before), ("Refined", after))):
                    sheet.paste(panel.resize((400, round(panel.height/2)), Image.Resampling.LANCZOS), (column*400, row*286+24))
                    draw.text((column*400+5, row*286+5), f"{expression}: {label}", fill="white")
            results.append({"expression": expression, "artwork_width": width,
                            "display_height": image.height, "rgb_rmse_before": rmse(reference, before),
                            "rgb_rmse_after": rmse(reference, after)})
    inventory = []
    for path in sorted((ROOT / "public/assets/face-layers").rglob("*.svg")):
        node = ET.parse(path).getroot()
        inventory.append({"file": path.relative_to(ROOT / "public/assets/face-layers").as_posix(),
                          "width": node.get("width"), "height": node.get("height"), "viewBox": node.get("viewBox")})
    sheet.save(OUT / f"{prefix}expression-comparison.png")
    (OUT / f"{prefix}validation-evidence.json").write_text(json.dumps({
        "tooling": {"rasterizer": "resvg-py (offline, not the target browser)", "background": "#080f1d"},
        "inventory": inventory, "results": results, "source_hashes_verified": len(evidence["source_hashes"]),
    }, indent=2)+"\n")
    print(json.dumps(results, indent=2))
    print(f"PASS: {len(inventory)} SVGs rendered; {len(evidence['source_hashes'])} source hashes unchanged.")


if __name__ == "__main__":
    main()
