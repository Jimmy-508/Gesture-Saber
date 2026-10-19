import {test} from 'node:test';import assert from 'node:assert/strict';
import {Quaternion,Euler,Vector3} from 'three';
import {BladeCommand} from '../src/blade-command.ts';import {WeaponControl} from '../src/weapon-control.ts';import {WeaponMorph} from '../src/weapon-morph.ts';
import {gripHand} from './fixtures/grip-hands.mjs';import {input} from './fixtures/twin-hands.mjs';
import {finalReplay} from '../benchmarks/final-replay.mjs';
import {WeaponControl as Baseline} from '../benchmarks/phase18-weapon-control.ts';
const fists=()=>[gripHand('Left'),gripHand('Right')];
test('either first hand learns a real grip shaft before single ignition; OPEN retains the same frame and ownership',()=>{
 for(const side of ['Left','Right']){
  const w=new WeaponControl();let t=1000;
  const feed=(open,q=new Quaternion(),x=side==='Left'?.57:.43)=>{const h=gripHand(side,{open,q,x,noise:.00002});w.observe(input([h],t),t,1.6);w.sample(t+30);t+=42;return h;};
  for(let i=0;i<4;i++)feed(true);
  assert.equal(w.primary,side);assert.equal(w.singleOn,false);assert.equal(w.grip.calibrated,false);
  let h;for(let i=0;i<4;i++)h=feed(false);
  assert.equal(w.singleOn,true);assert.ok(new Vector3(0,1,0).applyQuaternion(w.hand.rotation).angleTo(h.axis)<.006);
  // Roll and bend with open fingers: no reversion to wrist -> MCP longitudinal.
  for(let i=0;i<12;i++){const q=new Quaternion().setFromEuler(new Euler(i*.035,0,i*.05));h=feed(true,q);assert.ok(new Vector3(0,1,0).applyQuaternion(w.hand.rotation).angleTo(h.axis)<.012);}
  assert.equal(w.singleOn,false);assert.equal(w.primary,side);assert.equal(w.mode.twin,false);assert.equal(w.grip.calibrated,true);
 }
});
test('UNKNOWN is never OPEN; missing tips cannot block credible grip/position updates or refresh pose on real loss',()=>{
 const w=new WeaponControl();let t=1000;for(let i=0;i<4;i++,t+=42)w.observe(input([gripHand('Left')],t),t,1.6);assert.equal(w.singleOn,true);
 const p=w.hand.pose.position.clone(),q=w.hand.targetRotation.clone();
 for(let i=0;i<12;i++,t+=42){const h=gripHand('Left',{open:true,x:.57+i*.006,q:new Quaternion().setFromEuler(new Euler(0,0,i*.04))});for(const j of [8,12,16])for(const a of [h.points,h.world])a[j]={x:NaN,y:NaN,z:NaN};w.observe(input([h],t),t,1.6);assert.equal(w.blade.evidence,'UNKNOWN');assert.equal(w.singleOn,true);}
 assert.ok(w.hand.pose.position.distanceTo(p)>.2);assert.ok(w.hand.targetRotation.angleTo(q)>.2);
 const seen=w.lastSeen;w.observe(input([],t),t,1.6);assert.equal(w.lastSeen,seen);assert.equal(w.hand.lastSeen,seen);assert.equal(w.advance(seen+420),true);assert.equal(w.singleOn,false);assert.equal(w.grip.calibrated,false);
});
test('short evidence confirmation and hysteresis reject alternating fingers and interrupted candidates',()=>{
 const b=new BladeCommand();b.update('FIST',1000);b.update('FIST',1042);assert.equal(b.active,false);b.update('FIST',1084);assert.equal(b.active,true);
 for(let i=0;i<12;i++)b.update(i%2?'FIST':'OPEN',1126+i*42);assert.equal(b.active,true);
 b.update('OPEN',1700);b.update('UNKNOWN',1742);b.update('OPEN',1784);b.update('OPEN',1826);assert.equal(b.active,true);b.update('OPEN',1868);assert.equal(b.active,false);
 b.update('FIST',1910);b.update('FIST',2200);assert.equal(b.active,false,'a long gap is not continuous evidence');
});
test('same grip survives latched join and release; open primary cannot retract twin, returning single respects OPEN',()=>{
 for(const side of ['Left','Right']){
  const w=new WeaponControl(),m=new WeaponMorph();m.reset(false);let t=1000;
  const send=hands=>{const r=w.observe(input(hands,t),t,1.6);m.step(t,w.singleOn);if(r.changed)m.begin(w.mode.twin,t,w.hand.rotation,false);w.sample(t+20);m.step(t+20,w.singleOn);t+=42;};
  for(let i=0;i<5;i++)send([gripHand(side)]);const axis=w.grip.rotation.clone();assert.equal(w.singleOn,true);
  for(let i=0;i<14;i++)send(fists());assert.equal(w.mode.twin,true);assert.equal(m.front,1);assert.equal(m.rear,1);assert.ok(axis.angleTo(w.grip.rotation)<.005);
  for(let i=0;i<12;i++)send([gripHand(side,{open:true})]);assert.equal(w.singleOn,false);assert.equal(m.front,1);assert.equal(m.rear,1);assert.equal(m.on,true);assert.equal(w.mode.twin,true);
  let toggled=false;for(let i=0;i<10;i++){send(fists());if(!w.mode.twin){toggled=true;break;}}assert.equal(toggled,true);
  for(let i=0;i<12;i++)send([gripHand(side,{open:true})]);assert.equal(w.mode.twin,false);assert.equal(m.front,0);assert.equal(m.rear,0);assert.equal(m.on,false);assert.equal(w.primary,side);assert.ok(axis.angleTo(w.grip.rotation)<.005);
 }
});
test('empty hilt skips redundant retraction; common Grip never incurs a morph rotation chase; extended blades retain 120/60/160 timing',()=>{
 const m=new WeaponMorph(),q=new Quaternion().setFromEuler(new Euler(.2,.1,.8)),out=q.clone();m.reset(false);m.begin(true,1000,q,false);
 assert.equal(m.phase,'ALIGN');m.step(1030,false);assert.equal(m.front,0);assert.equal(m.on,false);m.orient(out,q,1030);assert.ok(out.angleTo(q)<1e-7);
 m.step(1060,false);assert.equal(m.phase,'EXTEND');assert.equal(m.on,true);assert.equal(m.front,0);m.step(1140,false);assert.equal(m.front,.5);assert.equal(m.rear,.5);m.step(1220,false);assert.equal(m.phase,'READY');assert.equal(m.front,1);
 m.begin(false,1300,q,false);m.step(1360,false);assert.equal(m.front,.5);assert.equal(m.rear,.5);m.step(1430,false);assert.equal(m.phase,'ALIGN');assert.equal(m.front,0);m.step(1480,false);assert.equal(m.on,false);m.step(1640,false);assert.equal(m.phase,'READY');assert.equal(m.front,0);assert.equal(m.rear,0);
 // A new deliberate fist extends once, then a deliberate OPEN reverses smoothly.
 m.step(1700,true);m.step(1780,true);assert.equal(m.front,.5);m.step(1780,false);assert.equal(m.front,.5);m.step(1840,false);assert.equal(m.front,.25);m.step(1900,false);assert.equal(m.front,0);
});
test('current single/twin Grip pipelines remain continuous through dropouts, reversals and stops; no new freeze or overshoot',()=>{
 for(const mode of ['single','twin'])for(const name of ['continuous','wrist','oneMiss','threeMiss','reverse','departure']){
  const r=finalReplay(WeaponControl,mode,name,'Left',true),old=finalReplay(Baseline,mode,name,'Left',true);
  assert.equal(r.freezeEvents,0);assert.equal(r.rejected,0);assert.ok(r.outputs.every(p=>p.rotation.every(Number.isFinite)));
  assert.ok(r.outputs.every(p=>p.twin===(mode==='twin')),'the measured pipeline must actually remain in its named mode');
  assert.ok(r.stopPositionError.max<=old.stopPositionError.max+1e-10);
  if(name==='continuous'||name==='wrist')assert.deepEqual(r.outputs.map(p=>p.position),old.outputs.map(p=>p.position));
  if(name==='reverse'){assert.ok(old.rejected>0);assert.ok(r.recoveryPositionStep.max<old.recoveryPositionStep.max);}
 }
});
