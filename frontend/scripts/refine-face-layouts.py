"""Measure quarter-pixel position candidates without editing artwork or configs.

Uses existing temporary Pillow/numpy/resvg-py tooling. Run the Node renderer
checks first to export runtime-config.json. Candidates require visual review.
"""
import hashlib
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image
import resvg_py

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "reports/face-decomposition"
BACKGROUND = np.array([203, 216, 226], dtype=float)


def fit(reference, source, position, excluded=()):
    image = Image.open(io.BytesIO(resvg_py.svg_to_bytes(svg_path=str(source), zoom=4))).convert("RGBA")
    pixels = np.asarray(image, dtype=float)
    # Sample one point per logical pixel, at master-image resolution.
    yy, xx = np.mgrid[2:image.height:4, 2:image.width:4]
    alpha = pixels[yy, xx, 3] / 255
    rgb = pixels[yy, xx, :3] * alpha[:, :, None] + BACKGROUND * (1-alpha[:, :, None])
    valid = alpha > 0.1
    yy, xx, rgb, alpha = yy[valid], xx[valid], rgb[valid], alpha[valid]
    x0, y0 = round(position["x"]*4), round(position["y"]*4)
    candidates = []
    for dy in range(-4, 5):
        for dx in range(-4, 5):
            x, y = xx+x0+dx, yy+y0+dy
            valid = (x >= 0) & (x < 3200) & (y >= 0) & (y < 1920)
            for box in excluded:
                valid &= ~((x >= box[0]*4) & (x < box[2]*4) & (y >= box[1]*4) & (y < box[3]*4))
            score = (((reference[y[valid], x[valid], :3]-rgb[valid])**2).sum(axis=1)*alpha[valid]).sum()/(alpha[valid].sum()*3)
            candidates.append((float(score), dx, dy))
    best, dx, dy = min(candidates)
    before = next(score for score, x, y in candidates if x == y == 0)
    return {"before": position, "candidate": {**position, "x": (x0+dx)/4, "y": (y0+dy)/4},
            "sample_rmse_before": round(float(np.sqrt(before)), 4),
            "sample_rmse_after": round(float(np.sqrt(best)), 4),
            "at_search_boundary": abs(dx) == 4 or abs(dy) == 4}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    config = json.loads((ROOT / "reports/face-layers/runtime-config.json").read_text())
    # Keep the baseline for reproducible before/after visual comparisons.
    baseline = OUT / "baseline-config.json"
    if not baseline.exists():
        baseline.write_text(json.dumps(config, indent=2)+"\n")
    else:
        config = json.loads(baseline.read_text())
    hashes = {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest()
              for directory in (ROOT / "public/assets/face-layers", ROOT / "public/assets/expressions")
              for path in directory.rglob("*") if path.is_file()}
    candidates = {}
    for name, composition in config["compositions"].items():
        reference = np.asarray(Image.open(ROOT / f"public/assets/expressions/{name}.png").convert("RGBA"), dtype=float)
        assert reference.shape == (1920, 3200, 4)
        candidates[name] = {}
        for part in ("leftEye", "rightEye", "mouth"):
            path = ROOT / "public" / config["assets"][composition[part]]["src"].lstrip("/")
            candidates[name][part] = fit(reference, path, config["layouts"][name][part])
        for effect in composition["effects"]:
            if effect["asset"] == "cryEffect":
                continue  # Preserve the explicitly requested foreground tear placement.
            path = ROOT / "public" / config["assets"][effect["asset"]]["src"].lstrip("/")
            candidates[name][f"effects.{effect['id']}"] = fit(reference, path, config["layouts"][name]["effects"][effect["id"]])
        if name == "idle":
            path = ROOT / "public/assets/face-layers/base/face-lines.svg"
            candidates[name]["faceLines"] = fit(reference, path, config["layouts"][name]["faceLines"], ((100, 140, 250, 330), (540, 140, 700, 330)))
    data = {"method": "Native SVG proportions rasterized at 4x; alpha-weighted RGB matching to 3200x1920 masters, +/-1 logical pixel in quarter-pixel steps. Diagnostic candidates, not visual approval. Effects retain user-approved placement.",
            "candidates": candidates, "source_hashes": hashes}
    (OUT / "coordinate-candidates.json").write_text(json.dumps(data, indent=2)+"\n")
    print(json.dumps(candidates, indent=2))


if __name__ == "__main__":
    main()
