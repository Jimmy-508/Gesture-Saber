import {Vector3} from 'three';
import {HandAssignment as BaselineAssignment} from './phase152-hand-assignment.ts';
import {PalmPose as BaselinePalm} from './phase152-palm-pose.ts';
import {MotionFilter as BaselineMotion} from './phase152-motion.ts';
import {HandAssignment} from '../src/hand-assignment.ts';import {PalmPose} from '../src/palm-pose.ts';import {MotionFilter} from '../src/motion.ts';
import {BladeState} from '../src/dynamics.ts';import {observeHand} from '../src/hand-presence.ts';import {TRACKING} from '../src/tracking-state.ts';import {HandTelemetry} from '../src/hand-telemetry.ts';
import {blueInput} from './blue-input.mjs';
export const stat=a=>{if(!a.length)return {mean:0,p95:0,peak:0};const sorted=[...a].sort((a,b)=>a-b);return {mean:a.reduce((s,n)=>s+n,0)/a.length,p95:sorted[Math.ceil(a.length*.95)-1],peak:sorted.at(-1)};};
function position(hand,out){const {x,y}=observeHand(hand.points),p=hand.points,height=2*Math.tan(21.5*Math.PI/180)*11;return out.set((.5-x)*height*16/9,(.5-y)*height+1,p[5]&&p[17]&&Number.isFinite(p[5].x)&&Number.isFinite(p[17].x)&&Number.isFinite(p[5].y)&&Number.isFinite(p[17].y)?Math.min(1,Math.max(-1,(Math.hypot(p[5].x-p[17].x,p[5].y-p[17].y)-.12)*7)):out.z);}
// Control-chain replay only. Real scene parity is tested separately in WebGL.
export function blueReplay(version,name,{trace=false}={}){
 const baseline=version==='1.5.2',P=baseline?BaselinePalm:PalmPose,F=baseline?BaselineMotion:MotionFilter,A=baseline?BaselineAssignment:HandAssignment,assignment=new A();
 const rig=()=>({palm:new P(),motion:new F(),state:new BladeState(),target:new Vector3(),telemetry:new HandTelemetry(),updates:0,reliable:0,guards:0,limits:0,freezes:0,errors:[],tips:[],hilt:[],lag:[],snapshots:[]});
 const hands={Left:rig(),Right:rig()},expectedP=new Vector3(),expectedTip=new Vector3(),tip=new Vector3(),cpu=[];let capture=0,index=0;const queue=[];
 for(let i=0;i<384;i++){const t=i*1000/120,now=1000+t;if(t>=capture){queue.push(blueInput(name,capture,index++));capture+=1000/24;}const began=performance.now();
  while(queue.length&&queue[0].time+24<=now){const packet=queue.shift(),matches=assignment.assign(packet);for(const side of ['Left','Right']){const s=hands[side],match=matches.find(m=>m.side===side);s.telemetry.result(packet.handedness.filter(h=>h[0].categoryName===(side==='Left'?'Right':'Left')).length,!!match,!!match?.freeze,now);if(!match){s.state.markLost('missing');continue;}const label=packet.handedness[match.index][0];if(!baseline)s.telemetry.recordInput(label.categoryName,label.score,side,match.freeze);
    if(match.freeze){s.state.observe(true,now);s.state.poseFrozen=true;s.palm.reliable=false;s.palm.status='身分歧義：保留姿態';s.motion.freeze();s.freezes++;continue;}
    const h=packet.hands[match.index];s.palm.update(h.points,h.world,side,packet.time,h.aspect);position(h,s.target);s.motion.push(s.target,s.palm.rotation,packet.time,now,s.palm.reliable);s.state.observe(true,now);s.updates++;if(s.palm.reliable)s.reliable++;if(/歧義|突變|銜接|矛盾/.test(s.palm.status))s.guards++;if(s.palm.limited)s.limits++;if(!baseline)s.telemetry.recordPose(s.palm);
  }}
  for(const s of Object.values(hands)){s.state.step(now,1000/120/1000);if(s.state.visible(now)){if(!s.state.poseFrozen&&now-s.state.lastSeen<TRACKING.staleMs)s.motion.sample(now);else s.motion.freeze();}}cpu.push(performance.now()-began);
  const truth=blueInput(name,t,i).truth;for(const [j,side] of ['Left','Right'].entries()){const s=hands[side],f=s.motion;tip.set(0,.12+2.75*s.state.extension,0).applyQuaternion(f.rotation).add(f.position);if(t>250&&s.state.visible(now)){position(truth[j],expectedP);expectedTip.set(0,.12+2.75*s.state.extension,0).applyQuaternion(truth[j].rotation).add(expectedP);s.errors.push(f.rotation.angleTo(truth[j].rotation));s.tips.push(tip.distanceTo(expectedTip));s.hilt.push(f.position.distanceTo(expectedP));s.lag.push(f.rotationLagMs);}
   if(trace)s.snapshots.push({t,position:f.position.toArray(),rotation:f.rotation.toArray(),tip:tip.toArray(),palm:s.palm.rotation.toArray(),reliable:s.palm.reliable,limited:s.palm.limited,palmStatus:s.palm.status,speed:f.speed,lag:f.rotationLagMs,prediction:f.rotationPredictionActive,status:s.state.status,active:s.state.active,extension:s.state.extension,visible:s.state.visible(now),frozen:s.state.poseFrozen});
  }
 }
 const result={version,name,cpuFrameMs:stat(cpu)};for(const side of ['Left','Right']){const s=hands[side];result[side]={updates:s.updates,reliable:s.reliable,guards:s.guards,limits:s.limits,freezes:s.freezes,rotationErrorRad:stat(s.errors),tipError:stat(s.tips),hiltError:stat(s.hilt),internalRotationLagMs:stat(s.lag),...(!baseline?{diagnostics:s.telemetry.snapshot(4200)}:{}),...(trace?{trace:s.snapshots}:{})};}return result;
}
