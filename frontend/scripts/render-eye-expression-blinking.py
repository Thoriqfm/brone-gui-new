"""Render all expression blinks with existing local resvg/Pillow; no installs."""
import importlib.metadata
import io
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import resvg_py
from PIL import Image, ImageChops

folder = Path('reports/eye-expression-blinking')
samples = json.loads((folder / 'samples.json').read_text(encoding='utf-8'))
assert len(samples) == 84
expressions = ['idle','happy','happier','sad','cry','shock','thinking']
results = []

def raster(text):
    return Image.open(io.BytesIO(resvg_py.svg_to_bytes(svg_string=text))).convert('RGBA')

def curve_y(lid, x):
    start, (a,b,q) = lid['start'], lid['curve']
    t = (x-start[0])/(q[0]-start[0])
    # All inspected supports use the same affine horizontal parameterization.
    return (1-t)**3*start[1]+3*(1-t)**2*t*a[1]+3*(1-t)*t*t*b[1]+t**3*q[1]

def connected(pixels):
    if not pixels:
        return False
    reached = {next(iter(pixels))}
    pending = list(reached)
    while pending:
        x,y = pending.pop()
        for dx in [-1,0,1]:
            for dy in [-1,0,1]:
                q = (x+dx,y+dy)
                if q in pixels and q not in reached:
                    reached.add(q)
                    pending.append(q)
    return reached == pixels

for expression in expressions:
    target = folder / expression
    for name in ['blink-grid','layout-grid']:
        (target / (name+'.png')).write_bytes(resvg_py.svg_to_bytes(svg_path=str(target / (name+'.svg'))))
    for sample in [s for s in samples if s['expression'] == expression]:
        side,p,svg = sample['side'],sample['progress'],sample['svg']
        prefix = f'{side}-{round(p*100):03}'
        (target / (prefix+'.svg')).write_text(svg, encoding='utf-8')
        png = resvg_py.svg_to_bytes(svg_string=svg)
        (target / (prefix+'.png')).write_bytes(png)
        image = Image.open(io.BytesIO(png)).convert('RGBA')
        assert image.size == (sample['width'],sample['height'])
        if p == 0:
            original = Path(sample['originalFile']).read_text(encoding='utf-8')
            for scale in [1,1.5,2]:
                images = []
                for text in [original,svg]:
                    tree = ET.fromstring(text)
                    tree.set('width',str(sample['width']*scale))
                    tree.set('height',str(sample['height']*scale))
                    images.append(raster(ET.tostring(tree,encoding='unicode')))
                diff = ImageChops.difference(*images)
                data = diff.tobytes()
                count = sum(any(data[i:i+4]) for i in range(0,len(data),4))
                result = {'expression':expression,'side':side,'progress':0,'scale':scale,'differingPixels':count,'maxChannelDifference':max(e[1] for e in diff.getextrema())}
                results.append(result)
                assert count == 0, result
        elif p == 1:
            visible = {(x,y) for y in range(image.height) for x in range(image.width) if image.getpixel((x,y))[3]}
            assert connected(visible), (expression,side,'closed contour disconnected')
            assert all(image.getpixel(q)[:3] == (0,0,0) for q in visible), (expression,side,'closed interior leak')
            results.append({'expression':expression,'side':side,'progress':p,'visiblePixels':len(visible),'oneConnectedBlackContour':True})
        else:
            visible = {(x,y) for y in range(image.height) for x in range(image.width) if image.getpixel((x,y))[3]}
            assert connected(visible), (expression,side,p,'detached visible source detail')
            colored = 0
            blue = 0
            for y in range(image.height):
                for x in range(image.width):
                    r,g,b,a = image.getpixel((x,y))
                    if a and max(r,g,b)>0:
                        colored += 1
                        assert curve_y(sample['upper'],x+.5)-1 <= y+.5 <= curve_y(sample['lower'],x+.5)+1, (expression,side,p,'color/detail outside aperture',x,y)
                        if b>r and g>r+20:
                            blue += 1
            results.append({'expression':expression,'side':side,'progress':p,'coloredPixels':colored,'bluePixels':blue,'colorInsideAperture':True})
            if expression == 'cry':
                assert blue > 0, (side,p,'water accidentally removed before full closure')

# Counts are a raster observation; exact nonnegative gap is independently tested in JS.
for expression in expressions:
    for side in ['left','right']:
        rows = [r for r in results if r['expression']==expression and r['side']==side and 0<r['progress']<1]
        assert all(a['coloredPixels'] >= b['coloredPixels'] for a,b in zip(rows,rows[1:])), (expression,side,'exposed colored area grew')

report = {'environment':{name:importlib.metadata.version(name) for name in ['resvg-py','Pillow']},
          'scope':'Static raster verification. Closed shapes are procedural and pending artistic approval. No browser/device/performance claim.',
          'openEndpointPairs':42,'results':results}
(folder / 'raster-validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('PASS: all 42 original/open RGBA pairs exact at 1x/1.5x/2x; 14 connected black-only closures; 56 clipped partials, monotone colored area, retained Cry water; 84 SVG/PNG samples and seven shape/layout grids.')
