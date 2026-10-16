import {Vector3,Quaternion} from 'three';
import {PalmPose as OldPalm} from './phase151-palm-pose.ts';
import {MotionFilter as OldMotion} from './phase151-motion.ts';
import {PalmPose} from '../src/palm-pose.ts';
import {MotionFilter} from '../src/motion.ts';
import {anatomicalHand,mirroredQuaternion} from '../tests/fixtures/anatomical-hands.mjs';
export const rotationCases=['slow','step30','step60','step90','swing','fastStop','jitter','degraded','occlusion','irregular','fastContinuous'];
export function rotationInput(name,t){
 if(name.startsWith('step'))return t<800?0:Number(name.slice(4))*Math.PI/180;
 if(name==='jitter')return 0;
 if(name==='slow')return .4*Math.sin(t/1100);
 if(name==='fastStop')return Math.max(0,Math.min(1000,t)-500)*.005;
 if(name==='fastContinuous')return t<500?0:Math.min(t-500,120)*.024;
 return .9*Math.sin(Math.max(0,t-500)/190);
}
export function summary(values){if(!values.length)return {mean:0,p95:0,peak:0};const sorted=[...values].sort((a,b)=>a-b);return {mean:values.reduce((s,v)=>s+v,0)/values.length,p95:sorted[Math.ceil(values.length*.95)-1],peak:sorted.at(-1)};}
export function positionInput(name,t){if(name==='fastStop')return Math.max(0,Math.min(t,1000)-500)*.0015;return ['swing','degraded','occlusion','irregular','fastContinuous'].includes(name)?.4*Math.sin(t/250):0;}
// The input trajectory is ground truth; noisy/delayed observations and rendered output stay separate.
export function replayRotation(version,name,{deliveryMs=24,trace=false}={}){
 const P=version==='1.5.1'?OldPalm:PalmPose,F=version==='1.5.1'?OldMotion:MotionFilter;
 const hands=[0,1].map(()=>({palm:new P(),motion:new F(),prior:new Quaternion(),observation:new Quaternion(),errors:[],directionErrors:[],palmErrors:[],tips:[],rotationTips:[],positions:[],steps:[],guards:0,limited:0,abruptRotations:0,flips:0,overshoot:0,lead:0,records:[],responseMs:null,stopObservedAt:null,stopSettleMs:null}));
 const axis=new Vector3(0,0,1),zero=new Vector3(),truthQ=new Quaternion(),truthDir=new Vector3(),renderDir=new Vector3(),tip=new Vector3(),cpu=[],inputGaps=[];let nextCapture=0,index=0,lastCapture=-Infinity,now=0;const queue=[];
 while(now<2400){
  if(now>=nextCapture){const capture=nextCapture,angle=rotationInput(name,capture),noise=(name==='jitter'?.012:.0015)*(Math.sin(index*2.17)+Math.sin(index*.73)*.5),q=new Quaternion().setFromAxisAngle(axis,angle+noise);
   if(!(name==='occlusion'&&capture>=900&&capture<1200)){
    const observations=[anatomicalHand('Left',q),anatomicalHand('Right',mirroredQuaternion(q))];
    if(name==='degraded'&&capture>900&&capture<1300)for(const h of observations){h.world[5].z=NaN;}
    queue.push({capture,arrive:capture+deliveryMs+(name==='irregular'?[0,12,5,20][index%4]:0),observations});
   }
   nextCapture+=name==='irregular'?[33,60,41,80,24][index%5]:1000/24;index++;
  }
  const start=performance.now();while(queue.length&&queue[0].arrive<=now){const packet=queue.shift();if(Number.isFinite(lastCapture))inputGaps.push(packet.capture-lastCapture);lastCapture=packet.capture;
   hands.forEach((h,j)=>{const obs=packet.observations[j];if(name==='fastStop'&&packet.capture>1000.01&&h.stopObservedAt===null)h.stopObservedAt=now;h.observation.copy(obs.rotation);h.palm.update(obs.points,obs.world,obs.side,packet.capture,obs.aspect);zero.set((j?-1:1)*positionInput(name,packet.capture),0,0);h.motion.push(zero,h.palm.rotation,packet.capture,now,h.palm.reliable);if(!h.palm.reliable)h.guards++;if(h.palm.limited)h.limited++;});}
  hands.forEach(h=>{if(now-h.motion.arrival>=180)h.motion.freeze();h.motion.sample(now);});cpu.push(performance.now()-start);
  hands.forEach((h,j)=>{if(!Number.isFinite(h.motion.lastSample))return;const sign=j?-1:1,angle=rotationInput(name,now),truth=sign*angle;truthQ.setFromAxisAngle(axis,truth);truthDir.set(0,1,0).applyQuaternion(truthQ);renderDir.set(0,1,0).applyQuaternion(h.motion.rotation);const error=h.motion.rotation.angleTo(truthQ),direction=renderDir.angleTo(truthDir),step=h.motion.rotation.angleTo(h.prior);h.prior.copy(h.motion.rotation);
   if(now>250){h.errors.push(error);h.directionErrors.push(direction);h.palmErrors.push(h.palm.rotation.angleTo(h.observation));tip.copy(renderDir).sub(truthDir).multiplyScalar(2.87);h.rotationTips.push(tip.length());zero.set(sign*positionInput(name,now),0,0);tip.add(h.motion.position).sub(zero);h.tips.push(tip.length());h.positions.push(h.motion.position.distanceTo(zero));h.steps.push(step);if(step>Math.PI/4)h.abruptRotations++;if(step>Math.PI/2&&Math.abs(rotationInput(name,now)-rotationInput(name,now-150))<.1)h.flips++;}
   const output=sign*Math.atan2(-renderDir.x,renderDir.y),slope=rotationInput(name,now)-rotationInput(name,now-8);if(Math.abs(slope)>.0001)h.lead=Math.max(h.lead,(output-angle)*Math.sign(slope));
   if(h.stopObservedAt!==null&&h.stopSettleMs===null&&direction<Math.PI/180)h.stopSettleMs=now-h.stopObservedAt;
   if((name.startsWith('step')&&now>=800)||(name==='fastStop'&&now>=1000)){if(name.startsWith('step')&&h.responseMs===null&&direction<Number(name.slice(4))*Math.PI/180*.1)h.responseMs=now-800;h.overshoot=Math.max(h.overshoot,output-angle);}
   h.records.push({t:now,truth,truthDirection:truthDir.toArray(),observedTime:h.motion.lastSample,observation:h.observation.toArray(),pose:h.palm.rotation.toArray(),output:h.motion.rotation.toArray(),direction:renderDir.toArray(),positionTruth:sign*positionInput(name,now),positionOutput:h.motion.position.x});
  });
  now+=name==='irregular'?[1000/60,1000/120,1000/30][Math.floor(now/100)%3]:1000/120;
 }
 const rows=hands.map(h=>{let lag=0,best=Infinity,positionLag=0,positionBest=Infinity;for(let candidate=0;candidate<=150;candidate+=2){let sum=0,pSum=0,n=0;for(const r of h.records)if(r.t>400){const sign=h===hands[1]?-1:1;truthQ.setFromAxisAngle(axis,sign*rotationInput(name,r.t-candidate));h.prior.fromArray(r.output);sum+=h.prior.angleTo(truthQ)**2;pSum+=(r.positionOutput-sign*positionInput(name,r.t-candidate))**2;n++;}if(sum/n<best){best=sum/n;lag=candidate;}if(pSum/n<positionBest){positionBest=pSum/n;positionLag=candidate;}}
  const still=h.records.filter(r=>(name==='jitter'?r.t>400:name==='fastStop'?r.t>1150:false)).map(r=>{truthQ.setFromAxisAngle(axis,(h===hands[1]?-1:1)*rotationInput(name,r.t));h.prior.fromArray(r.output);return h.prior.angleTo(truthQ);});
  const stationary=h.records.filter(r=>name==='jitter'?r.t>400:name==='fastStop'?r.t>1150:false),meanDir=new Vector3();for(const r of stationary)meanDir.add(renderDir.fromArray(r.direction));meanDir.normalize();let jitterSquared=0;for(const r of stationary)jitterSquared+=renderDir.fromArray(r.direction).angleTo(meanDir)**2;
  return {rotationErrorRad:summary(h.errors),directionErrorRad:summary(h.directionErrors),palmObservationErrorRad:summary(h.palmErrors),tipError:summary(h.tips),rotationOnlyTipError:summary(h.rotationTips),positionError:summary(h.positions),rotationStepRad:summary(h.steps),bestFitLagMs:lag,positionBestFitLagMs:positionLag,step90PercentMs:h.responseMs,stopSettleMs:h.stopSettleMs,stationaryErrorRad:summary(still),stationaryJitterRmsRad:stationary.length?Math.sqrt(jitterSquared/stationary.length):0,guards:h.guards,limited:h.limited,abruptRotations:h.abruptRotations,falseFlips:h.flips,overshootRad:Math.max(0,h.overshoot),leadingErrorRad:Math.max(0,h.lead),...(trace?{trace:h.records.filter((_,i)=>i%4===0)}:{})};});
 return {version,name,cpuFrameMs:summary(cpu),inputGapMs:summary(inputGaps),left:rows[0],right:rows[1]};
}
