// Generate review SVGs from actual React markup. Run from frontend.
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";
const output = "reports/mouth-multi-expression";
const server = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: "custom" });
try {
    const { MOUTH_TARGETS, MOUTH_EXPRESSIONS, MOUTH_EXPRESSION_PRESETS: presets, sampleIdleMouthTransition: sample, interpolateMouthLayout: layout } = await server.ssrLoadModule("/src/geometry/mouth/index.ts");
    const { default: Mouth } = await server.ssrLoadModule("/src/components/face/mouth/ProceduralMouth.tsx");
    const { createElement } = await import(pathToFileURL(await realpath("node_modules/react/index.js")));
    const { renderToStaticMarkup } = await import(pathToFileURL(await realpath("node_modules/react-dom/server.node.js")));
    const progress = [0,0.1,0.25,0.5,0.75,0.9,1];
    const svg = (w,h,content) => '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'"><rect width="100%" height="100%" fill="#edf3f9"/>'+content+'</svg>';
    const text = (x,y,label) => '<text x="'+x+'" y="'+y+'" font-family="Arial" font-size="14" fill="#152b43">'+label+'</text>';
    const render = (g,id) => renderToStaticMarkup(createElement(Mouth,{geometry:g})).replaceAll(/_R_0_/g,id);
    let shapes="", placements="", endpoints="";
    for (const [row,target] of MOUTH_TARGETS.entries()) for (const [col,t] of progress.entries()) {
        const g=sample(target,t), pos=layout(presets.idle.layout,presets[target].layout,t), rendered=render(g,target+'-'+col);
        shapes+=text(col*304+10,row*210+22,target+' '+Math.round(t*100)+'%');
        shapes+='<g transform="translate('+(col*304+(304-g.width)/2)+' '+(row*210+40+(155-g.height)/2)+')">'+rendered+'</g>';
        placements+=text(col*320+10,row*220+18,target+' '+Math.round(t*100)+'%');
        placements+='<svg x="'+col*320+'" y="'+(row*220+25)+'" width="320" height="192" viewBox="0 0 800 480"><rect width="800" height="480" fill="#e0e8f0"/>'+rendered.replace('<svg ','<svg x="'+pos.x+'" y="'+pos.y+'" ')+'</svg>';
    }
    const files={idle:"idle",happy:"happier",sad:"sad",cry:"cry",shock:"shock",thinking:"thinking"};
    for(const [row,name] of MOUTH_EXPRESSIONS.entries()) {
        const g=presets[name].geometry;
        const source=await readFile('public/assets/face-layers/mouth/'+files[name]+'-mouth.svg','utf8');
        for(const [col,markup] of [source,render(g,'endpoint-'+name)].entries()) {
            endpoints+=text(col*330+10,row*200+20,name+(col?' generated':' original'));
            endpoints+='<g transform="translate('+(col*330+(330-g.width)/2)+' '+(row*200+32+(155-g.height)/2)+')">'+markup+'</g>';
        }
    }
    await mkdir(output,{recursive:true});
    for(const [name,markup] of Object.entries({"morph-grid":svg(2128,1050,shapes),"layout-grid":svg(2240,1100,placements),"endpoint-comparison":svg(660,1200,endpoints)})) await writeFile(output+'/'+name+'.svg',markup);
    console.log('Wrote actual-renderer review SVGs to '+output);
} finally {await server.close();}
