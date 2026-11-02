"""Static visual QA after verify-eye-morphing.mjs; uses existing resvg/Pillow tools."""
import base64
import argparse
import importlib.metadata
import io
import json
from pathlib import Path
import tempfile
import xml.etree.ElementTree as ET

import resvg_py
from PIL import Image, ImageChops

parser = argparse.ArgumentParser()
parser.add_argument('--target', choices=['happier', 'sad', 'cry', 'thinking'], default='happier')
parser.add_argument('--source', choices=['idle', 'sad'], default='idle')
parser.add_argument('--reverse', action='store_true')
args = parser.parse_args()
target, source_expression = args.target, args.source
if source_expression == 'sad' and target != 'cry':
    parser.error('Sad source supports only Cry')
start_expression, end_expression = (target, source_expression) if args.reverse else (source_expression, target)
folder = Path(f'reports/eye-thinking-morphing/{start_expression}-{end_expression}' if target == 'thinking' else
              f'reports/eye-cry-morphing/{start_expression}-{end_expression}' if target == 'cry' else
              'reports/eye-sad-morphing' if target == 'sad' else 'reports/eye-morphing')
if args.reverse and target not in ['cry', 'thinking']:
    parser.error('Reverse artifact input is available for Cry and Thinking transitions only')
samples = json.loads((folder / 'samples.json').read_text(encoding='utf-8'))
assert len(samples) == 14
(folder / 'morph-grid.png').write_bytes(resvg_py.svg_to_bytes(svg_path=str(folder / 'morph-grid.svg')))
results = []
with tempfile.TemporaryDirectory(prefix='brone-eye-morph-') as temp:
    for sample in samples:
        if sample['progress'] not in [0, 1]:
            continue
        side = sample['side']
        expression = start_expression if sample['progress'] == 0 else end_expression
        source = Path(f'public/assets/face-layers/eyes/{side}/{expression}-eye-{side}.svg').read_text(encoding='utf-8')
        for scale in [1, 1.5, 2]:
            images = []
            for index, text in enumerate([source, sample['svg']]):
                svg = ET.fromstring(text)
                svg.set('width', str(sample['width'] * scale))
                svg.set('height', str(sample['height'] * scale))
                path = Path(temp) / f'{index}.svg'
                ET.ElementTree(svg).write(path, encoding='utf-8')
                images.append(Image.open(io.BytesIO(resvg_py.svg_to_bytes(svg_path=str(path)))).convert('RGBA'))
            assert images[0].size == images[1].size
            diff = ImageChops.difference(*images)
            data = diff.tobytes()
            count = sum(any(data[i:i+4]) for i in range(0, len(data), 4))
            result = {'expression': expression, 'side': side, 'scale': scale,
                      'rasterSize': images[0].size, 'differingPixels': count,
                      'maxChannelDifference': max(v[1] for v in diff.getextrema())}
            results.append(result)
            assert count == 0, result

progresses = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]
cells = []
for index, progress in enumerate(progresses):
    content = []
    for sample in [s for s in samples if s['progress'] == progress]:
        image = 'data:image/svg+xml;base64,' + base64.b64encode(sample['svg'].encode()).decode()
        p = sample['layout']
        content.append(f'<image x="{p["x"]}" y="{p["y"]}" width="{p["width"]}" height="{p["height"]}" href="{image}"/>')
    x, y = index % 4 * 400, index // 4 * 270
    cells.append(f'<g transform="translate({x} {y})"><text x="12" y="24" fill="white">{round(progress*100)}%</text>'
                 f'<svg y="30" width="400" height="240" viewBox="0 0 800 480">{"".join(content)}</svg></g>')
layout = '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="540"><rect width="100%" height="100%" fill="#080f1d"/>' + ''.join(cells) + '</svg>'
(folder / 'layout-grid.svg').write_text(layout, encoding='utf-8')
(folder / 'layout-grid.png').write_bytes(resvg_py.svg_to_bytes(svg_path=str(folder / 'layout-grid.svg')))
(folder / 'endpoint-raster-validation.json').write_text(json.dumps({
    'versions': {name: importlib.metadata.version(name) for name in ['resvg-py', 'Pillow']},
    'scope': 'Actual morph API endpoints compared with original approved SVGs; transparent RGBA, static resvg only.',
    'results': results,
}, indent=2), encoding='utf-8')
print('PASS: 12 morph endpoint raster pairs have zero differing RGBA pixels; shape/layout PNG sheets generated for visual review.')
