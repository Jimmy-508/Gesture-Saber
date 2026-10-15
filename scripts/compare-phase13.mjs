import {TrailBuffer as Before} from '../benchmarks/phase12-trail.ts';
import {TrailBuffer as After} from '../src/trail.ts';
import {Vector3} from 'three';
import {synthesize} from '../src/sound-design.ts';
import {writeFile} from 'node:fs/promises';
function measure(Version){
 const trail=new Version(),base=new Vector3(),tip=new Vector3(),right=new Vector3(1,0,0),batches=[];let vertices=0;
 for(let batch=0;batch<12;batch++){
  const start=performance.now();for(let i=0;i<2000;i++){const frame=batch*2000+i,t=frame/60;base.set(Math.sin(t*3)*.8,0,Math.cos(t)*.15);tip.set(base.x+Math.sin(t*2)*1.1,2.4,base.z);trail.update(base,tip,frame*1000/60,1,.18,right);vertices=Math.max(vertices,trail.vertices);}
  if(batch>=2)batches.push((performance.now()-start)/2000);
 }
 batches.sort((a,b)=>a-b);return {meanMs:batches.reduce((a,b)=>a+b)/batches.length,p95BatchMs:batches[Math.floor(batches.length*.95)],peakVertices:vertices,allocatedGeometryBytes:trail.positions.byteLength+trail.ages.byteLength+trail.uvs.byteLength};
}
const sounds={};for(const name of ['hum','soft','fast','ignite','retract']){const a=synthesize(name);sounds[name]={samples:a.length,peak:a.reduce((max,x)=>Math.max(max,Math.abs(x)),0),rms:Math.sqrt(a.reduce((sum,x)=>sum+x*x,0)/a.length),seam:Math.abs(a[0]-a.at(-1))};}
// Alternate order to reduce a fixed warmup/order bias. Timing remains a desktop CPU microbenchmark.
const runs=[];for(let i=0;i<4;i++)runs.push(i%2?{after:measure(After),before:measure(Before)}:{before:measure(Before),after:measure(After)});
const report={environment:{node:process.version,platform:process.platform},method:'Same process; four alternating-order runs, 24000 simulated 60 Hz frames per version/run, first 4000 warmup. Batch CPU timing only; no GPU/camera/audio device/tablet FPS measurement.',runs,sounds};
await writeFile('reports/phase13-cpu.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
