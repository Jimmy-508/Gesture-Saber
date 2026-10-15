import {PalmPose as BeforePose} from '../benchmarks/phase13-palm-pose.ts';
import {MotionFilter as BeforeMotion} from '../benchmarks/phase13-motion.ts';
import {PalmPose} from '../src/palm-pose.ts';
import {MotionFilter} from '../src/motion.ts';
import {HandAssignment} from '../src/hand-assignment.ts';
import {anatomicalHand,mirroredQuaternion,detections} from '../tests/fixtures/anatomical-hands.mjs';
import {Quaternion,Euler,Vector3} from 'three';
import {writeFile} from 'node:fs/promises';
const frames=Array.from({length:240},(_,i)=>{const t=i/240*Math.PI*2,q=new Quaternion().setFromEuler(new Euler(-.7+Math.sin(t)*.5,Math.sin(t)*.6,Math.sin(t*2)*.4));const hands=[anatomicalHand('Left',q),anatomicalHand('Right',mirroredQuaternion(q))];return {hands,data:detections(hands,0)}});
function measure(current){
 const poses=[new (current?PalmPose:BeforePose)(),new (current?PalmPose:BeforePose)()],motion=[new (current?MotionFilter:BeforeMotion)(),new (current?MotionFilter:BeforeMotion)()],assignment=new HandAssignment(),position=new Vector3(),batches=[];
 for(let batch=0;batch<14;batch++){
  const start=performance.now();for(let i=0;i<1200;i++){
   const frame=batch*1200+i,time=1000+frame*1000/24,{hands,data}=frames[frame%240];data.time=time;
   const selected=current?assignment.assign(data):[{side:'Left',index:0},{side:'Right',index:1}];
   for(const {side,index} of selected){const j=side==='Left'?0:1,h=hands[index],p=poses[j];p.update(h.points,h.world,side,time,h.aspect);motion[j].push(position,p.rotation,time,time,current?p.reliable:true);motion[j].sample(time+8);}
  }
  if(batch>=2)batches.push((performance.now()-start)/1200);
 }
 return {meanMsPerDualHandInput:batches.reduce((s,n)=>s+n,0)/batches.length,peakBatchMeanMs:Math.max(...batches)};
}
const runs=[];for(let i=0;i<4;i++)runs.push(i%2?{after:measure(true),before:measure(false)}:{before:measure(false),after:measure(true)});
const report={environment:{node:process.version,platform:process.platform},method:'Alternating-order desktop CPU microbenchmark. Precomputed full anatomical hands at 24 Hz; 16800 inputs/version/run, first 2400 warmup. Includes new temporal assignment, bilateral pose and MotionFilter; excludes camera, MediaPipe, audio and GPU. Not a tablet latency or FPS measurement.',runs};
await writeFile('reports/phase131-cpu.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
