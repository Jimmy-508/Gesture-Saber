import {Quaternion,Euler,Vector3} from 'three';
import {WeaponControl} from '../src/weapon-control.ts';
import {WeaponControl as Baseline} from './phase18-weapon-control.ts';
import {ControlPose} from '../src/control-pose.ts';
import {GripPose} from '../src/grip-pose.ts';
import {commandHand,input} from '../tests/fixtures/twin-hands.mjs';
import {gripHand} from '../tests/fixtures/grip-hands.mjs';
import {observeHand} from '../src/hand-presence.ts';

const summary=a=>{const s=[...a].sort((a,b)=>a-b);return {mean:a.reduce((a,b)=>a+b,0)/(a.length||1),p95:s[Math.floor((s.length-1)*.95)]??0,max:s.at(-1)??0};};
const missing=(name,i)=>name==='oneMiss'?i===4:name==='threeMiss'||name==='reverse'?i>=3&&i<=5:false;
function trajectory(name,t){
 const u=Math.min(t,900)/1000;
 let x=.5+.20*Math.sin(u*12),a=.9*Math.sin(u*12);
 if(name==='reverse'){x=t<84?.2+t/84*.5:t<252?.7-(t-84)/168*.4:.3+Math.min(t-252,400)/400*.1;a=.35;}
 if(name==='wrist'){x=.5;a=Math.sin(u*16)*1.3;}
 if(name==='ambiguity'){x=.65;a=0;}
 return {x,q:new Quaternion().setFromEuler(new Euler(.12*Math.sin(u*8),0,a))};
}
export function finalReplay(System,mode,name,side='Left',gripAll=false){
 const w=new System(),base=2000,delay=24,frame=1000/60,refPose=new ControlPose(),refGrip=new GripPose(),seed=gripHand(side);refGrip.update(seed.points,seed.world,side);
 w.observe(input([gripAll?gripHand(side):commandHand(side)],500),524,1.6);
 if(mode==='twin')for(let t=550;t<=950;t+=42)w.observe(input([gripHand(side),gripHand(side==='Left'?'Right':'Left')],t),t+delay,1.6);
 if(mode==='twin'&&!w.mode.twin)throw Error('Twin setup did not trigger');
 const handAt=t=>{const p=trajectory(name,t);return mode==='twin'||gripAll?gripHand(side,{...p,open:mode==='twin'}):commandHand(side,p);};
 // Let the command-only secondary leave and expire before measuring movement;
 // otherwise the setup itself injects a real two-identity ambiguity.
 for(let t=1000;t<base;t+=42){const h=t<1500?(mode==='twin'||gripAll?gripHand(side,{open:mode==='twin'}):commandHand(side)):handAt(0);w.observe(input([h],t),t+delay,1.6);w.sample(t+delay+16);}
 if(mode==='twin'&&!w.mode.twin)throw Error('Twin mode was lost during setup; this is not a twin replay');
 const other=()=>commandHand(side==='Left'?'Right':'Left',{x:.25});
 if(name==='ambiguity')w.observe(input([handAt(0),other()],1980),2004,1.6);
 const events=[];for(let i=0;i<34;i++){const t=i*42;let hands=missing(name,i)||name==='departure'&&i>=6?[]:[handAt(t)];
  if(name==='ambiguity'){hands=[handAt(t),other()];if(i>=3&&i<=5)for(const h of hands){const c=observeHand(h.points);for(const p of h.points){p.x+=.5-c.x;p.y+=.5-c.y;}}}
  events.push({at:base+t+delay,data:input(hands,base+t),i});
 }
 let e=0,prevP,prevQ,lastUpdate=0,recoverUntil=-Infinity,wasMissing=false,freeze=false,freezeEvents=0,freezeMs=0,stationaryMs=0,rejected=0,accepted=0,expiry=null,prevRefP,prevRefQ;
 const stepP=[],stepQ=[],recoverP=[],recoverQ=[],errorsP=[],errorsQ=[],tipErrors=[],stopErrors=[],cpu=[],observeCpu=[],outputs=[];
 for(let now=base+delay;now<base+delay+1400;now+=frame){
  while(e<events.length&&events[e].at<=now+1e-7){const event=events[e++],owned=!!w.primary,started=performance.now(),r=w.observe(event.data,event.at,1.6);observeCpu.push(performance.now()-started);if(owned&&!w.primary&&expiry===null)expiry=event.at-base-delay;const ok=!!r?.match&&!r.match.freeze;if(event.i>=0){if(ok){accepted++;if(wasMissing)recoverUntil=event.at+42;lastUpdate=event.at;}else if(event.data.landmarks.length)rejected++;wasMissing=!ok;}}
  const began=performance.now();if(w.advance(now)&&expiry===null)expiry=now-base-delay;w.sample(now);cpu.push(performance.now()-began);
  if(!w.primary)continue;
  if(w.hand.frozen){freezeMs+=frame;if(!freeze)freezeEvents++;}freeze=w.hand.frozen;
  const t=now-base-delay,h=handAt(t);refPose.update(h.points,h.world,side,1.6);if(mode==='twin'||gripAll)refGrip.update(h.points,h.world,side);
  const refQ=mode==='twin'||gripAll?refGrip.rotation:refPose.rotation;
  if(t>50){errorsP.push(w.hand.position.distanceTo(refPose.position));errorsQ.push(w.hand.rotation.angleTo(refQ)*180/Math.PI);const actualTip=new Vector3(0,2.87,0).applyQuaternion(w.hand.rotation).add(w.hand.position),trueTip=new Vector3(0,2.87,0).applyQuaternion(refQ).add(refPose.position);tipErrors.push(actualTip.distanceTo(trueTip));}
  if(t>1050)stopErrors.push(w.hand.position.distanceTo(refPose.position));
  if(prevP){const p=w.hand.position.distanceTo(prevP),q=w.hand.rotation.angleTo(prevQ)*180/Math.PI;stepP.push(p);stepQ.push(q);if(now<=recoverUntil){recoverP.push(p);recoverQ.push(q);}if(p<1e-6&&q<1e-4&&(refPose.position.distanceTo(prevRefP)>.001||refQ.angleTo(prevRefQ)>.001))stationaryMs+=frame;}
  prevRefP=refPose.position.clone();prevRefQ=refQ.clone();
  prevP=w.hand.position.clone();prevQ=w.hand.rotation.clone();outputs.push({t,twin:w.mode.twin,position:w.hand.position.toArray(),rotation:w.hand.rotation.toArray(),validAge:now-lastUpdate});
 }
 return {mode,name,side,accepted,rejected,freezeEvents,freezeMs,stationaryWhileInputMovesMs:stationaryMs,recoveryPositionStep:summary(recoverP),recoveryAngleStepDeg:summary(recoverQ),renderPositionStep:summary(stepP),renderAngleStepDeg:summary(stepQ),positionError:summary(errorsP),rotationErrorDeg:summary(errorsQ),tipError:summary(tipErrors),stopPositionError:summary(stopErrors),cpuSampleMs:summary(cpu),cpuObserveMs:summary(observeCpu),expiry,outputs};
}
export function finalComparison(){return ['single','twin'].flatMap(mode=>['continuous','wrist','oneMiss','threeMiss','reverse','ambiguity','departure'].map(name=>{const before=finalReplay(Baseline,mode,name),after=finalReplay(WeaponControl,mode,name);let unchanged=before.outputs.length===after.outputs.length;let maxNormalOutputDifference=0;for(let i=0;i<Math.min(before.outputs.length,after.outputs.length);i++){const a=before.outputs[i],b=after.outputs[i];const d=Math.max(...a.position.map((x,j)=>Math.abs(x-b.position[j])),...a.rotation.map((x,j)=>Math.abs(x-b.rotation[j])));maxNormalOutputDifference=Math.max(maxNormalOutputDifference,d);unchanged&&=d<1e-12;}delete before.outputs;delete after.outputs;return {mode,name,before,after,unchanged,maxNormalOutputDifference};}));}
if(process.argv[1]?.endsWith('final-replay.mjs')){const {writeFileSync}=await import('node:fs');const results=finalComparison();writeFileSync('reports/phase181-comparison.json',JSON.stringify({scope:'Deterministic synthetic observations: 24 Hz capture, 24 ms delivery, 60 Hz render. Scene units, not physical metres. No tablet or model-detection claim. CPU sample excludes inference/WebGL.',baseline:'b5c8c90043394e472319454e8f6532176539147f',results},null,2)+'\n');for(const r of results)console.log(r.mode,r.name,JSON.stringify({freeze:[r.before.freezeMs,r.after.freezeMs],rejected:[r.before.rejected,r.after.rejected],recoveryP:[r.before.recoveryPositionStep.max,r.after.recoveryPositionStep.max],recoveryQ:[r.before.recoveryAngleStepDeg.max,r.after.recoveryAngleStepDeg.max],unchanged:r.unchanged}));}
