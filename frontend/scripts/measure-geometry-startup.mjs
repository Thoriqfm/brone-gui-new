// Run from frontend: node scripts/measure-geometry-startup.mjs
import {createServer} from 'vite';
const server=await createServer({optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false,watch:null},appType:'custom'});
try {
 const {sampleProductionGeometry}=await server.ssrLoadModule('/src/animation/productionGeometry.ts');
 const rows=[];
 for(const expression of ['happier','sad','cry','thinking','timeout','happier-transition']) {
  let start=performance.now();sampleProductionGeometry('idle',expression,.5);const cold=performance.now()-start;
  start=performance.now();for(let i=0;i<20;i++)sampleProductionGeometry('idle',expression,.5);
  rows.push({expression,firstMs:+cold.toFixed(2),repeatMeanMs:+((performance.now()-start)/20).toFixed(2)});
 }
 console.log(JSON.stringify({environment:'Node '+process.version+' / '+process.platform+' / '+process.arch,method:'one first sample then mean of 20 repeats; not Jetson/browser FPS',rows},null,2));
}finally{await server.close()}
