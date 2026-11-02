"""Optional static raster QA after verify-eye-geometry.mjs.

Uses the existing external asset-tool environment (resvg_py/Pillow), not frontend
dependencies. Run from frontend with that environment's PYTHONPATH.
"""
import base64
import importlib.metadata
import io
import json
from pathlib import Path
import re
import tempfile
import xml.etree.ElementTree as ET

import resvg_py
from PIL import Image, ImageChops

root = ET.parse('reports/eye-endpoint-comparison.svg').getroot()
results = []
with tempfile.TemporaryDirectory(prefix='brone-eye-review-') as temp:
    groups = root.findall('{http://www.w3.org/2000/svg}g')
    assert len(groups) == 2
    for index, group in enumerate(groups):
        images = group.findall('{http://www.w3.org/2000/svg}image')
        assert len(images) == 2
        endpoints = [ET.fromstring(base64.b64decode(e.get('href').split(',')[1])) for e in images]
        for scale in [1, 1.5, 2]:
            rendered = []
            for j, svg in enumerate(endpoints):
                svg.set('width', str(129 * scale))
                svg.set('height', str(171 * scale))
                path = Path(temp) / f'{index}-{j}-{scale}.svg'
                ET.ElementTree(svg).write(path, encoding='utf-8')
                rendered.append(Image.open(io.BytesIO(resvg_py.svg_to_bytes(svg_path=str(path)))).convert('RGBA'))
            assert rendered[0].size == rendered[1].size
            diff = ImageChops.difference(*rendered)
            data = diff.tobytes()
            count = sum(any(data[i:i + 4]) for i in range(0, len(data), 4))
            result = {'side': ['left', 'right'][index], 'scale': scale,
                      'rasterSize': rendered[0].size, 'differingPixels': count,
                      'maxChannelDifference': max(v[1] for v in diff.getextrema())}
            results.append(result)
            assert count == 0, result
Path('reports/eye-endpoint-comparison.png').write_bytes(
    resvg_py.svg_to_bytes(svg_path='reports/eye-endpoint-comparison.svg'))
Path('reports/eye-raster-validation.json').write_text(json.dumps({
    'versions': {name: importlib.metadata.version(name) for name in ['resvg-py', 'Pillow']},
    'scope': 'Static source versus React SSR inline SVG, transparent RGBA; not a browser test.',
    'results': results,
}, indent=2), encoding='utf-8')
print('PASS: six source/procedural RGBA pairs at 1x, 1.5x and 2x; zero differing pixels.')

# Phase 2: compare complete XML attributes/ordering and all canonical/preview pairs.
def canonical(svg):
    root = ET.fromstring(svg)
    ids = {e.get('id'): f'resource-{i}' for i, e in enumerate(root.iter()) if e.get('id')}
    def normalize(element, results=None):
        tag = element.tag.split('}')[-1]
        if tag == 'filter':
            results = {e.get('result'): f'result-{i}' for i, e in enumerate(element) if e.get('result')}
        attributes = {}
        for key, value in element.attrib.items():
            if element is root and key in ['preserveAspectRatio', 'aria-hidden', 'data-procedural-eye']:
                continue
            if key == 'id':
                value = ids[value]
            elif value.startswith('url(#'):
                value = 'url(#' + ids[value[5:-1]] + ')'
            elif key.endswith('}href'):
                value = '#' + ids[value[1:]]
            elif key in ['in', 'in2', 'result'] and results and value in results:
                value = results[value]
            elif key in ['d', 'values', 'transform', 'viewBox']:
                tokens = re.findall(r'[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?|[A-Za-z]+', value)
                value = [float(v) if re.match(r'[-+\d.]', v) else v for v in tokens]
            elif re.fullmatch(r'[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?', value):
                value = float(value)
            attributes[key] = value
        return {'tag': tag, 'attributes': attributes,
                'children': [normalize(child, results) for child in element]}
    return normalize(root)


manifest = Path('reports/eye-multi-expression/endpoints.json')
if manifest.exists():
    endpoints = json.loads(manifest.read_text(encoding='utf-8'))
    assert len(endpoints) == 16
    expanded = []
    with tempfile.TemporaryDirectory(prefix='brone-all-eyes-') as temp:
        for endpoint in endpoints:
            assert canonical(endpoint['original']) == canonical(endpoint['procedural']), (endpoint['expression'], endpoint['side'], 'complete XML fidelity')
            for scale in [1, 1.5, 2]:
                rendered = []
                for label in ['original', 'procedural']:
                    svg = ET.fromstring(endpoint[label])
                    svg.set('width', str(endpoint['width'] * scale))
                    svg.set('height', str(endpoint['height'] * scale))
                    path = Path(temp) / f'{label}.svg'
                    ET.ElementTree(svg).write(path, encoding='utf-8')
                    rendered.append(Image.open(io.BytesIO(resvg_py.svg_to_bytes(svg_path=str(path)))).convert('RGBA'))
                assert rendered[0].size == rendered[1].size
                diff = ImageChops.difference(*rendered)
                data = diff.tobytes()
                count = sum(any(data[i:i + 4]) for i in range(0, len(data), 4))
                result = {'expression': endpoint['expression'], 'side': endpoint['side'], 'scale': scale,
                          'rasterSize': rendered[0].size, 'differingPixels': count,
                          'maxChannelDifference': max(v[1] for v in diff.getextrema())}
                expanded.append(result)
                assert count == 0, result
    Path('reports/eye-multi-expression/raster-validation.json').write_text(json.dumps({
        'versions': {name: importlib.metadata.version(name) for name in ['resvg-py', 'Pillow']},
        'scope': '16 full XML tree comparisons; 48 transparent RGBA pairs. Static resvg, not browser QA.',
        'results': expanded,
    }, indent=2), encoding='utf-8')
    Path('reports/eye-multi-expression/endpoint-comparison.png').write_bytes(
        resvg_py.svg_to_bytes(svg_path='reports/eye-multi-expression/endpoint-comparison.svg'))
    print('PASS: 16 complete XML trees (all attributes, paint order and scoped references); 48 raster pairs at 1x/1.5x/2x, zero differing pixels.')
