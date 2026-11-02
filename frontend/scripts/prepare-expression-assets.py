"""Generate lossless derivatives and validate them. Requires Pillow (tooling only)."""
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, __version__, features

ROOT = Path(__file__).resolve().parents[1]
MASTERS = ROOT / "public/assets/expressions"
OUTPUT = MASTERS / "production"
REPORTS = ROOT / "reports/expression-assets"
TARGET = (1490, 894)
NAMES = ("idle", "happy", "happier", "sad", "cry", "shock", "thinking", "happier-transition")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    OUTPUT.mkdir(exist_ok=True)
    REPORTS.mkdir(parents=True, exist_ok=True)
    rows = []
    previews = Image.new("RGB", (960, len(NAMES) * 224), "#080f1d")
    draw = ImageDraw.Draw(previews)
    for index, name in enumerate(NAMES):
        master = MASTERS / f"{name}.png"
        before = digest(master)
        with Image.open(master) as source:
            assert source.size == (3200, 1920), (name, source.size)
            assert source.width * TARGET[1] == source.height * TARGET[0]
            original = source.convert("RGBA")
            # Pillow resizes RGBA through premultiplied alpha to avoid dark fringes.
            resized = original.resize(TARGET, Image.Resampling.LANCZOS)
            png = OUTPUT / f"{name}.png"
            webp = OUTPUT / f"{name}.webp"
            resized.save(png, optimize=True, compress_level=9)
            resized.save(webp, lossless=True, exact=True, method=6)
            with Image.open(png) as p, Image.open(webp) as w:
                p, w = p.convert("RGBA"), w.convert("RGBA")
                assert p.size == w.size == TARGET
                assert p.tobytes() == w.tobytes() == resized.tobytes(), name
                alpha = p.getchannel("A")
                corners = [alpha.getpixel(point) for point in ((0, 0), (1489, 0), (0, 893), (1489, 893))]
                assert corners == [0, 0, 0, 0], (name, corners)
                histogram = alpha.histogram()
                assert sum(histogram[1:255]) > 0, name
                for column, (label, image) in enumerate((("Master scaled", original), ("Resized PNG", p), ("Lossless WebP", w))):
                    thumb = image.resize((310, 186), Image.Resampling.LANCZOS)
                    previews.paste(thumb, (column * 320, index * 224 + 30), thumb)
                    draw.text((column * 320 + 4, index * 224 + 8), f"{name}: {label}", fill="white")
                if name == "idle":
                    detail = Image.new("RGB", (960, 500), "#080f1d")
                    detail_draw = ImageDraw.Draw(detail)
                    for column, image in enumerate((resized, p, w)):
                        # Magnified corner and outline at production resolution.
                        crop = image.crop((0, 0, 160, 240)).resize((320, 480), Image.Resampling.NEAREST)
                        detail.paste(crop, (column * 320, 20), crop)
                        detail_draw.text((column * 320 + 4, 4), ("Resize reference", "PNG", "WebP")[column], fill="white")
                    detail.save(REPORTS / "corner-detail.png")
                rows.append({"name": name, "master_bytes": master.stat().st_size,
                             "png_bytes": png.stat().st_size, "webp_bytes": webp.stat().st_size,
                             "master_sha256": before, "dimensions": TARGET,
                             "identical_decoded_rgba": True, "corner_alpha": corners,
                             "partial_alpha_pixels": sum(histogram[1:255])})
        assert digest(master) == before, f"Master changed: {name}"
    previews.save(REPORTS / "visual-comparison.png")
    report = {"pillow": __version__, "libwebp": features.version("webp"),
              "resampling": "Lanczos, premultiplied alpha", "assets": rows,
              "totals": {key: sum(row[key] for row in rows) for key in ("master_bytes", "png_bytes", "webp_bytes")}}
    (REPORTS / "comparison.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
