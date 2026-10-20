import {test} from 'node:test';import assert from 'node:assert/strict';
import {Quaternion,Euler,Vector3} from 'three';
import {WeaponControl} from '../src/weapon-control.ts';import {WeaponMorph} from '../src/weapon-morph.ts';
import {gripHand} from './fixtures/grip-hands.mjs';import {input} from './fixtures/twin-hands.mjs';
import {finalReplay} from '../benchmarks/final-replay.mjs';
import {WeaponControl as Baseline} from '../benchmarks/phase18-weapon-control.ts';
import {fistEvidence} from '../src/twin-gesture.ts';
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
  assert.equal(w.singleOn,true);assert.equal(w.primary,side);assert.equal(w.mode.twin,false);assert.equal(w.grip.calibrated,true);
 }
});
test('missing tips cannot retract the blade, block credible grip/position updates or refresh pose on real loss',()=>{
 const w=new WeaponControl();let t=1000;for(let i=0;i<4;i++,t+=42)w.observe(input([gripHand('Left')],t),t,1.6);assert.equal(w.singleOn,true);
 const p=w.hand.pose.position.clone(),q=w.hand.targetRotation.clone();
 for(let i=0;i<12;i++,t+=42){const h=gripHand('Left',{open:true,x:.57+i*.006,q:new Quaternion().setFromEuler(new Euler(0,0,i*.04))});for(const j of [8,12,16])for(const a of [h.points,h.world])a[j]={x:NaN,y:NaN,z:NaN};w.observe(input([h],t),t,1.6);assert.equal(w.singleOn,true);}
 assert.ok(w.hand.pose.position.distanceTo(p)>.2);assert.ok(w.hand.targetRotation.angleTo(q)>.2);
 const seen=w.lastSeen;w.observe(input([],t),t,1.6);assert.equal(w.lastSeen,seen);assert.equal(w.hand.lastSeen,seen);assert.equal(w.advance(seen+420),true);assert.equal(w.singleOn,false);assert.equal(w.grip.calibrated,false);
});
test('blade readiness waits for an accepted direction, then survives direction holds without a finger gate',()=>{
 const w=new WeaponControl(),original=w.grip.update;w.grip.update=function(){this.calibrated=true;return false;};
 w.observe(input([gripHand('Left')],1000),1000,1.6);assert.equal(w.singleOn,false);
 w.grip.reset();w.grip.update=original;w.observe(input([gripHand('Left')],1042),1042,1.6);assert.equal(w.singleOn,true);
 w.grip.update=()=>false;w.observe(input([gripHand('Left',{open:true})],1084),1084,1.6);assert.equal(w.singleOn,true);
 assert.equal(w.hand.lastSeen,1084);w.reset();assert.equal(w.singleOn,false);
});
test('a usable shaft can ignite without a FIST classification: two curled fingers and two open fingers are UNKNOWN',()=>{
 for(const side of ['Left','Right']){
  const h=gripHand(side),open=gripHand(side,{open:true}),offset={x:h.world[0].x-open.world[0].x,y:h.world[0].y-open.world[0].y,z:h.world[0].z-open.world[0].z};
  for(const i of [13,14,15,16,17,18,19,20]){h.points[i]={...open.points[i]};h.world[i]={x:open.world[i].x+offset.x,y:open.world[i].y+offset.y,z:open.world[i].z+offset.z};}
  assert.equal(fistEvidence(h.points,h.world).kind,'UNKNOWN');const w=new WeaponControl();w.observe(input([h],1000),1000,1.6);
  assert.equal(w.singleOn,true);assert.ok(w.grip.direction.angleTo(h.axis)<.006);
 }
});
test('only the original primary refreshes weapon lifetime; a tracked secondary cannot keep its blade alive',()=>{
 for(const side of ['Left','Right']){
  const other=side==='Left'?'Right':'Left',w=new WeaponControl();let t=1000;
  const primary=()=>gripHand(side,{x:.75}),secondary=()=>gripHand(other,{x:.25});
  w.observe(input([primary()],t),t,1.6);
  for(let i=0;i<3;i++){t+=42;w.observe(input([primary(),secondary()],t),t,1.6);}
  const seen=w.lastSeen,updates=w.hand.updates;
  for(let i=0;i<7;i++){t+=42;w.observe(input([secondary()],t),t,1.6);assert.equal(w.primary,side);assert.equal(w.lastSeen,seen);assert.equal(w.hand.updates,updates);}
  assert.equal(w.advance(seen+419),false);assert.equal(w.advance(seen+420),true);assert.equal(w.singleOn,false);assert.equal(w.primary,null);
 }
});
test('same grip survives latched join and release; open primary cannot retract twin, returning single relights even with OPEN',()=>{
 for(const side of ['Left','Right']){
  const w=new WeaponControl(),m=new WeaponMorph();m.reset(false);let t=1000;
  const send=hands=>{const r=w.observe(input(hands,t),t,1.6);m.step(t,w.singleOn);if(r.changed)m.begin(w.mode.twin,t,w.hand.rotation,false);w.sample(t+20);m.step(t+20,w.singleOn);t+=42;};
  for(let i=0;i<5;i++)send([gripHand(side)]);const axis=w.grip.rotation.clone();assert.equal(w.singleOn,true);
  for(let i=0;i<14;i++)send(fists());assert.equal(w.mode.twin,true);assert.equal(m.front,1);assert.equal(m.rear,1);assert.ok(axis.angleTo(w.grip.rotation)<.005);
  for(let i=0;i<12;i++)send([gripHand(side,{open:true})]);assert.equal(w.singleOn,true);assert.equal(m.front,1);assert.equal(m.rear,1);assert.equal(m.on,true);assert.equal(w.mode.twin,true);
  let toggled=false;for(let i=0;i<10;i++){send(fists());if(!w.mode.twin){toggled=true;break;}}assert.equal(toggled,true);
  for(let i=0;i<12;i++)send([gripHand(side,{open:true})]);assert.equal(w.mode.twin,false);assert.equal(m.front,1);assert.equal(m.rear,0);assert.equal(m.on,true);assert.equal(w.primary,side);assert.ok(axis.angleTo(w.grip.rotation)<.005);
 }
});
test('empty hilt skips redundant retraction; common Grip never incurs a morph rotation chase; extended blades retain 120/60/160 timing',()=>{
 const m=new WeaponMorph(),q=new Quaternion().setFromEuler(new Euler(.2,.1,.8)),out=q.clone();m.reset(false);m.begin(true,1000,q,false);
 assert.equal(m.phase,'ALIGN');m.step(1030,false);assert.equal(m.front,0);assert.equal(m.on,false);m.orient(out,q,1030);assert.ok(out.angleTo(q)<1e-7);
 m.step(1060,false);assert.equal(m.phase,'EXTEND');assert.equal(m.on,true);assert.equal(m.front,0);m.step(1140,false);assert.equal(m.front,.5);assert.equal(m.rear,.5);m.step(1220,false);assert.equal(m.phase,'READY');assert.equal(m.front,1);
 m.begin(false,1300,q,false);m.step(1360,true);assert.equal(m.front,.5);assert.equal(m.rear,.5);m.step(1430,true);assert.equal(m.phase,'ALIGN');assert.equal(m.front,0);m.step(1480,true);assert.equal(m.on,true);m.step(1640,true);assert.equal(m.phase,'READY');assert.equal(m.front,1);assert.equal(m.rear,0);

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
