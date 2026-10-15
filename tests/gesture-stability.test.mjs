import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Quaternion,Vector3,Euler} from 'three';
import {classifyGesture} from '../src/gesture.ts';
import {BladeState} from '../src/dynamics.ts';
import {MotionFilter} from '../src/motion.ts';
import {TrailBuffer} from '../src/trail.ts';
import {HandAssignment} from '../src/hand-assignment.ts';
import {anatomicalHand,detections} from './fixtures/anatomical-hands.mjs';
const ev=kind=>({kind,count:kind==='OPEN'?4:0,confidence:kind==='UNKNOWN'?0:1,reason:'test '+kind});
function noisy(p,seed=1){return p.map((v,i)=>Object.fromEntries(['x','y','z'].map((k,j)=>[k,v[k]+Math.sin(seed+i*3.17+j*7.13)*.0006])));}
function curled(hand){const p=structuredClone(hand.world);for(const i of [5,9,13,17]){const a=p[i],sign=hand.side==='Left'?-1:1;p[i+1]={x:a.x,y:a.y-.035,z:a.z+.008};p[i+2]={x:a.x+sign*.003,y:a.y-.020,z:a.z+.030};p[i+3]={x:a.x+sign*.004,y:a.y+.001,z:a.z+.019};}return noisy(p);}
test('noisy anatomical open hands remain OPEN up, flat forward, toward/back camera, roll, and fast translated swings',()=>{
 for(const side of ['Left','Right'])for(let i=0;i<=80;i++){
  const q=new Quaternion().setFromEuler(new Euler(i/80*Math.PI,Math.sin(i)*.2,i/80*Math.PI*2));
  const h=anatomicalHand(side,q,.5+Math.sin(i)*.2);
  assert.equal(classifyGesture(noisy(h.points,i),noisy(h.world,i),h.aspect).kind,'OPEN',side+' frame '+i);
 }
});
test('explicit anatomical curled fingers yield FIST; failed tip-distance alone and corrupt/contradictory data never imply fist',()=>{
 for(const side of ['Left','Right']){const h=anatomicalHand(side);const fist=curled(h);
  assert.equal(classifyGesture([],fist).kind,'FIST');
  for(const angle of [0,Math.PI/2,Math.PI]){const q=new Quaternion().setFromEuler(new Euler(angle,.3,-.2));const rotated=fist.map(p=>new Vector3(p.x,p.y,p.z).applyQuaternion(q));const image=rotated.map(p=>({x:.5+p.x*2,y:.5+p.y*2*h.aspect,z:p.z*2}));assert.equal(classifyGesture(image,rotated,h.aspect).kind,'FIST');}
  assert.equal(classifyGesture(h.points,fist,h.aspect).kind,'UNKNOWN');
  const broken=structuredClone(h.world);for(const i of [5,9,13,17])broken[i+3]={...broken[0]};
  assert.equal(classifyGesture([],broken).kind,'UNKNOWN');
  assert.equal(classifyGesture(h.points,h.world.slice(0,10),h.aspect).kind,'OPEN');
  const collapsed=h.world.map(()=>({x:0,y:0,z:0}));assert.equal(classifyGesture(h.points,collapsed).kind,'UNKNOWN');
 }
 assert.equal(classifyGesture([]).kind,'UNKNOWN');
});
function opened(){const s=new BladeState();s.observeGesture(ev('OPEN'),1000);s.observeGesture(ev('OPEN'),1111);s.step(1111,.1);s.step(1160,.1);return s;}
test('OPEN UNKNOWN OPEN holds; continuous UNKNOWN expires, genuine fist still closes in 80 ms',()=>{
 const s=opened();s.observeGesture(ev('UNKNOWN'),1200);s.step(1200,.02);assert.equal(s.active,true);
 s.observeGesture(ev('OPEN'),1250);s.step(1250,.02);assert.equal(s.active,true);
 s.observeGesture(ev('FIST'),1300);s.step(1300,.02);assert.equal(s.active,true);
 s.observeGesture(ev('FIST'),1380);s.step(1380,.02);assert.equal(s.active,false);
 const u=opened();for(let t=1200;t<=1900;t+=50){u.observeGesture(ev('UNKNOWN'),t);u.step(t,.05);}assert.equal(u.active,false);assert.match(u.reason,/UNKNOWN/);
});
test('short LOST preserves activation, sustained loss retracts then hides, independent hands and explicit reset diagnostics',()=>{
 const left=opened(),right=opened();left.observeGesture(ev('LOST'),1200);left.step(1250,.02);assert.equal(left.active,true);
 left.observeGesture(ev('OPEN'),1280);left.step(1280,.02);assert.equal(left.active,true);
 left.observeGesture(ev('LOST'),1300);
 for(let t=1320;t<=1720;t+=20){left.step(t,.02);right.observeGesture(ev('OPEN'),t);right.step(t,.02);}
 assert.equal(left.extension,0);assert.equal(left.visible(1720),false);assert.equal(right.active,true);assert.match(left.diagnostics(1720),/LOST.*隱藏/);
 left.reset();assert.equal(left.evidence.kind,'LOST');
});
test('missing assigned identity freezes displayed pose and prediction; reacquisition interpolates; no trails are emitted during loss',()=>{
 const m=new MotionFilter(),q=new Quaternion();m.push(new Vector3(),q,1000,1000);m.push(new Vector3(.2,0,0),q,1042,1042);m.sample(1055);m.freeze();const held=m.position.clone();m.sample(1150);assert.ok(m.position.distanceTo(held)<1e-9);
 m.push(new Vector3(.3,0,0),q,1400,1400);assert.ok(m.position.distanceTo(held)<1e-9);m.sample(1435);assert.ok(m.position.x>.25);
 const trail=new TrailBuffer(),right=new Vector3(1,0,0);trail.update(new Vector3(),new Vector3(0,3,0),1000,1,.18,right);trail.update(new Vector3(.1,0,0),new Vector3(.1,3,0),1020,1,.18,right);assert.ok(trail.vertices>0);
 trail.update(new Vector3(1,0,0),new Vector3(1,3,0),1100,1,.18,right,false);trail.update(new Vector3(2,0,0),new Vector3(2,3,0),1250,1,.18,right,false);assert.equal(trail.vertices,0);
});
test('crossing and overlap report missing assignment rather than inventing a fist; recovery retains hand ownership',()=>{
 const a=new HandAssignment();let pair=[anatomicalHand('Left'),anatomicalHand('Right')];assert.equal(a.assign(detections(pair,1000)).length,2);
 for(let i=1;i<=6;i++){pair=[anatomicalHand('Left',new Quaternion(),.7-i*.05),anatomicalHand('Right',new Quaternion(),.3+i*.05)];const result=a.assign(detections(pair,1000+i*40));for(const r of result)assert.equal(r.side,pair[r.index].side);}
 assert.equal(a.assign(detections([],1300)).length,0);assert.equal(a.assign(detections([anatomicalHand('Left'),anatomicalHand('Right')],1400)).length,2);
});
