"""Static blink QA with the project's existing resvg/Pillow environment only."""
import importlib.metadata
import io
import json
import re
from pathlib import Path
import xml.etree.ElementTree as ET
import resvg_py
from PIL import Image, ImageChops

folder = Path('reports/eye-blinking')
samples = json.loads((folder / 'samples.json').read_text(encoding='utf-8'))
assert len(samples) == 12
(folder / 'blink-grid.png').write_bytes(resvg_py.svg_to_bytes(svg_path=str(folder / 'blink-grid.svg')))
results = []
for sample in samples:
    svg = sample['svg']
    png = resvg_py.svg_to_bytes(svg_string=svg)
    (folder / f"{sample['side']}-{round(sample['progress']*100):03}.svg").write_text(svg, encoding='utf-8')
    (folder / f"{sample['side']}-{round(sample['progress']*100):03}.png").write_bytes(png)
    image = Image.open(io.BytesIO(png)).convert('RGBA')
    if sample['progress'] == 1:
        raw = image.tobytes()
        pixels = [tuple(raw[i:i+4]) for i in range(0, len(raw), 4)]
        assert any(a for r, g, b, a in pixels), 'closed stroke visible'
        assert all((r, g, b) == (0, 0, 0) for r, g, b, a in pixels if a), 'no gradient/highlight/filter leakage'
        # Every nonempty row/column through this shallow contour stays connected.
        xs = sorted({x for y in range(image.height) for x in range(image.width) if image.getpixel((x, y))[3]})
        assert xs == list(range(xs[0], xs[-1]+1)), 'no disconnected closed stroke'
        visible = {(x,y) for y in range(image.height) for x in range(image.width) if image.getpixel((x,y))[3]}
        pending = [next(iter(visible))]
        reached = set(pending)
        while pending:
            x,y = pending.pop()
            for dx in [-1,0,1]:
                for dy in [-1,0,1]:
                    q = (x+dx,y+dy)
                    if q in visible and q not in reached:
                        reached.add(q)
                        pending.append(q)
        assert reached == visible, 'one connected closed contour'
        results.append({'side':sample['side'], 'progress':1, 'visiblePixels':sum(a>0 for r,g,b,a in pixels), 'onlyBlackStroke':True})
    if 0 < sample['progress'] < 1:
        tree = ET.fromstring(svg)
        paths = {n.attrib.get('data-blink-upper', 'missing'): n for n in tree.iter() if 'data-blink-upper' in n.attrib}
        upper_node = paths['']
        lower_node = next(n for n in tree.iter() if 'data-blink-lower' in n.attrib)
        def curve_y(node, x):
            values = list(map(float, re.findall(r'[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?', node.attrib['d'])))
            t = (x-values[0])/(values[6]-values[0])
            return (1-t)**3*values[1]+3*(1-t)**2*t*values[3]+3*(1-t)*t*t*values[5]+t**3*values[7]
        colored = 0
        for y in range(image.height):
            for x in range(image.width):
                r,g,b,a = image.getpixel((x,y))
                if a and max(r,g,b) > 0:
                    colored += 1
                    assert curve_y(upper_node,x+.5)-1 <= y+.5 <= curve_y(lower_node,x+.5)+1, 'detail outside aperture'
        results.append({'side':sample['side'], 'progress':sample['progress'], 'coloredPixels':colored, 'allColorInsideAperture':True})
    if sample['progress'] == 0:
        original = Path(f"public/assets/face-layers/eyes/{sample['side']}/idle-eye-{sample['side']}.svg").read_text(encoding='utf-8')
        for scale in [1, 1.5, 2]:
            images = []
            for text in [original, svg]:
                tree = ET.fromstring(text)
                tree.set('width', str(sample['width']*scale))
                tree.set('height', str(sample['height']*scale))
                images.append(Image.open(io.BytesIO(resvg_py.svg_to_bytes(svg_string=ET.tostring(tree, encoding='unicode')))).convert('RGBA'))
            diff = ImageChops.difference(*images)
            data = diff.tobytes()
            count = sum(any(data[i:i+4]) for i in range(0,len(data),4))
            result = {'side':sample['side'], 'progress':0, 'scale':scale, 'differingPixels':count, 'maxChannelDifference':max(e[1] for e in diff.getextrema())}
            results.append(result)
            assert count == 0, result
(folder / 'raster-validation.json').write_text(json.dumps({'versions':{name:importlib.metadata.version(name) for name in ['resvg-py','Pillow']},'scope':'Static resvg, not browser approval','results':results}, indent=2), encoding='utf-8')
print('PASS: six open endpoint RGBA pairs exact; both closed eyes contain connected black strokes only; twelve SVG/PNG samples and grid generated.')
