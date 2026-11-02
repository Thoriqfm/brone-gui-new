"""Static SVG/RGBA validation using the existing external resvg/Pillow environment."""
import base64
import importlib.metadata
import io
import json
from pathlib import Path
import resvg_py
from PIL import Image, ImageChops, ImageDraw, ImageFilter

folder=Path("reports/morph-aware-blinking")
samples=json.loads((folder/"samples.json").read_text(encoding="utf-8"))
canonical=json.loads((folder/"canonical.json").read_text(encoding="utf-8"))
def raster(svg):
    return Image.open(io.BytesIO(resvg_py.svg_to_bytes(svg_string=svg))).convert("RGBA")
def identical(a,b,label):
    assert a.size==b.size,label
    diff=ImageChops.difference(a,b)
    assert all(high==0 for _,high in diff.getextrema()),label
def components(image):
    w,h=image.size
    active={(x,y) for y in range(h) for x in range(w) if image.getpixel((x,y))[3]}
    count=0
    while active:
        count+=1;stack=[active.pop()]
        while stack:
            x,y=stack.pop()
            for dx,dy in ((-1,-1),(0,-1),(1,-1),(-1,0),(1,0),(-1,1),(0,1),(1,1)):
                q=(x+dx,y+dy)
                if q in active:active.remove(q);stack.append(q)
    return count

metrics=[];opened=set();grids={};svg_grids={}
for row in canonical:
    identical(raster(row["actual"]),raster(row["original"]),"canonical blink delegation")
for sample in samples:
    key=f'{sample["from"]}-{sample["to"]}'
    out=folder/key;out.mkdir(exist_ok=True)
    image=raster(sample["svg"]);dom=raster(sample["dom"])
    identical(image,dom,(key,sample["side"],sample["m"],sample["b"],"imperative/React equivalence"))
    open_key=(key,sample["side"],sample["m"])
    if open_key not in opened:
        identical(raster(sample["open"]),raster(sample["currentOpen"]),(open_key,"exact current morph open endpoint"))
        opened.add(open_key)
    if sample["b"]==1:
        assert all(r==g==b==0 for r,g,b,a in image.getdata() if a),(key,sample["side"],sample["m"],"interior leakage at closure")
        assert components(image)==1,(key,sample["side"],sample["m"],"connected closed stroke")
    elif sample["aperture"]:
        width,height=sample["width"],sample["height"]
        mask=raster(f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}"><path d="{sample["aperture"]}" fill="white"/></svg>').getchannel("A").filter(ImageFilter.MaxFilter(3))
        for y in range(image.height):
            for x in range(image.width):
                r,g,b,a=image.getpixel((x,y))
                if a>1 and max(r,g,b)>4:assert mask.getpixel((x,y))>0,(key,sample["side"],sample["m"],sample["b"],"colored content outside aperture")
    name=f'{sample["side"]}-m{round(sample["m"]*100):03}-b{round(sample["b"]*100):03}'
    (out/(name+".svg")).write_text(sample["svg"],encoding="utf-8");image.save(out/(name+".png"))
    m_index=[0,.25,.5,.75,1].index(sample["m"]);b_index=[0,.25,.5,.75,.9,1].index(sample["b"])
    sheet=grids.setdefault(key,Image.new("RGB",(1920,1200),"#dce4ec"))
    draw=ImageDraw.Draw(sheet);x=b_index*320+(12 if sample["side"]=="left" else 170);y=m_index*240+34
    sheet.paste(image,(x,y),image)
    draw.text((b_index*320+10,m_index*240+9),f'{key}: m{round(sample["m"]*100)} b{round(sample["b"]*100)}',fill="#152b43")
    encoded=base64.b64encode(sample["svg"].encode()).decode()
    svg_grids.setdefault(key,[]).append(f'<image x="{x}" y="{y}" width="{sample["width"]}" height="{sample["height"]}" href="data:image/svg+xml;base64,{encoded}"/>')
    metrics.append({k:sample[k] for k in ("from","to","side","m","b")})
for key,sheet in grids.items():
    sheet.save(folder/key/"grid.png")
    (folder/key/"grid.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1200"><rect width="100%" height="100%" fill="#dce4ec"/>'+''.join(svg_grids[key])+'</svg>',encoding="utf-8")
(folder/"raster-validation.json").write_text(json.dumps({
    "versions":{name:importlib.metadata.version(name) for name in ("resvg-py","Pillow")},
    "scope":"Static resvg RGBA, not browser QA. Partial aperture containment has a one-pixel antialias margin; endpoint equality and full closure have no tolerance.",
    "canonicalComparisons":len(canonical),"currentOpenComparisons":len(opened),"reactDomComparisons":len(samples),
    "closedConnectedBlackOnly":sum(s["b"]==1 for s in samples),"samples":metrics,
},indent=2),encoding="utf-8")
print(f'PASS: {len(canonical)} canonical comparisons; {len(opened)} exact current-open comparisons; {len(samples)} React/DOM comparisons; 100 connected black-only closures; partial aperture containment; ten SVG/PNG grids.')
