"""Static production comparison QA. Uses the established external resvg/Pillow tools.

Run after verify-production-renderer.mjs, from frontend. No application dependencies.
"""
import importlib.metadata
import io
import json
from pathlib import Path
import xml.etree.ElementTree as ET

import resvg_py
from PIL import Image, ImageChops, ImageDraw

folder = Path("reports/production-geometry")


def raster(svg):
    return Image.open(io.BytesIO(resvg_py.svg_to_bytes(svg_string=svg))).convert("RGBA")


def difference(a, b):
    assert a.size == b.size
    diff = ImageChops.difference(a, b)
    pixels = list(diff.getdata())
    return {"differingPixels": sum(any(p) for p in pixels),
            "maxChannelDifference": max(high for _, high in diff.getextrema()),
            "meanAbsoluteChannelDifference": sum(sum(p) for p in pixels) / (len(pixels) * 4)}


endpoints = json.loads((folder / "endpoints.json").read_text(encoding="utf-8"))
metrics = []
for row in endpoints:
    for scale in (1, 1.5, 2):
        images = []
        for kind in ("original", "procedural"):
            svg = ET.fromstring(row[kind])
            svg.set("width", str(row["width"] * scale))
            svg.set("height", str(row["height"] * scale))
            images.append(raster(ET.tostring(svg, encoding="unicode")))
        result = {"expression": row["expression"], "part": row["part"], "scale": scale,
                  "exactPromised": row["exact"], **difference(*images)}
        metrics.append(result)
        if row["exact"]:
            assert result["differingPixels"] == 0, result

faces = json.loads((folder / "faces.json").read_text(encoding="utf-8"))
full_metrics = []
# Seven rows, three columns; checkerboard makes transparent display margins visible.
sheet = Image.new("RGB", (1500, len(faces) * 356), "#e4e8ef")
draw = ImageDraw.Draw(sheet)
for row, face in enumerate(faces):
    expression = face["expression"]
    images = {}
    for col, mode in enumerate(("reference", "asset", "procedural")):
        image = raster((folder / f"{expression}-{mode}.svg").read_text(encoding="utf-8"))
        image.save(folder / f"{expression}-{mode}.png")
        images[mode] = image
        thumb = image.resize((490, 316), Image.Resampling.LANCZOS)
        x, y = col * 500 + 5, row * 356 + 28
        for yy in range(y, y + 316, 16):
            for xx in range(x, x + 490, 16):
                color = "#ccd4de" if ((xx-x)//16 + (yy-y)//16) % 2 else "#f4f6fa"
                draw.rectangle((xx, yy, min(xx+15, x+489), min(yy+15, y+315)), fill=color)
        sheet.paste(thumb, (x, y), thumb)
        draw.text((x+4, row*356+8), f"{expression}: {mode}", fill="#152b43")
    for a, b in (("asset", "procedural"), ("reference", "asset"), ("reference", "procedural")):
        full_metrics.append({"expression": expression, "comparison": a+" vs "+b,
                             **difference(images[a], images[b])})
sheet.save(folder / "full-face-comparison.png")

# Endpoint details at native size; paired source/procedural eye and mouth crops.
detail = Image.new("RGB", (1100, len(faces)*240), "#e4e8ef")
draw = ImageDraw.Draw(detail)
for row, face in enumerate(faces):
    selected = [e for e in endpoints if e["expression"] == face["expression"]]
    for col, part in enumerate(selected):
        x, y = col*365+8, row*240+30
        draw.text((x,row*240+8), face["expression"]+" "+part["part"]+": source | procedural",fill="#152b43")
        for k, name in enumerate(("original", "procedural")):
            image=raster(part[name])
            if image.width > 170:
                image.thumbnail((170,185),Image.Resampling.LANCZOS)
            detail.paste(image,(x+k*178,y),image)
detail.save(folder / "endpoint-details.png")

(folder / "raster-validation.json").write_text(json.dumps({
    "versions": {name: importlib.metadata.version(name) for name in ("resvg-py", "Pillow")},
    "scope": "Actual React production SSR layer markup exported to static SVG. Transparent RGBA, not browser or robot QA.",
    "endpointComparisons": metrics, "fullFaceComparisons": full_metrics,
}, indent=2), encoding="utf-8")
print(f"PASS: {len(metrics)} production endpoint raster comparisons; all exact-promised endpoints are identical.")
print("Wrote 21 full-face PNGs, full-face-comparison.png, endpoint-details.png and raster-validation.json.")
for result in full_metrics:
    if result["comparison"] == "asset vs procedural":
        print(json.dumps(result))
