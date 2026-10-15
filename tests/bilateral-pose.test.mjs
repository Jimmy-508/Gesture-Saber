import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Quaternion,Euler,Matrix4} from 'three';
import {PalmPose} from '../src/palm-pose.ts';
import {PalmPose as Phase13Pose} from '../benchmarks/phase13-palm-pose.ts';
import {MotionFilter} from '../src/motion.ts';
import {HandAssignment} from '../src/hand-assignment.ts';
import {anatomicalHand,mirroredQuaternion,detections} from './fixtures/anatomical-hands.mjs';
function update(p,h,t){return p.update(h.points,h.world,h.side,t,h.aspect);}
function pair(q){return [anatomicalHand('Left',q),anatomicalHand('Right',mirroredQuaternion(q))];}
function checkMirror(left,right){assert.ok(right.direction.distanceTo(new Vector3(-left.direction.x,left.direction.y,left.direction.z))<1e-5);assert.ok(right.rotation.angleTo(mirroredQuaternion(left.rotation))<1e-5);}
test('anatomical thumbs/fingers reflect across the full hand; up, forward, palms up/down and tilts have symmetric right-handed bases',()=>{
 for(const h of pair(new Quaternion()))assert.ok(Math.abs(h.world[4].x-h.world[0].x)>Math.abs(h.world[8].x-h.world[0].x),'thumb is anatomically lateral');
 for(const e of [[0,0,0],[-Math.PI/2,0,0],[-Math.PI/2,Math.PI,0],[Math.PI/2,0,0],[0,0,-.7],[0,0,.7],[0,Math.PI,0]]){
  const q=new Quaternion().setFromEuler(new Euler(...e)),hands=pair(q),poses=hands.map(()=>new PalmPose());
  for(let i=0;i<2;i++){const h=hands[i],p=poses[i];update(p,h,1000);assert.ok(p.direction.distanceTo(new Vector3(0,1,0).applyQuaternion(h.rotation))<1e-6);assert.ok(Math.abs(new Matrix4().makeRotationFromQuaternion(p.rotation).determinant()-1)<1e-6);}
  checkMirror(...poses);if(e[0]===-Math.PI/2)assert.ok(poses.every(p=>p.direction.z<-.99));
 }
});
test('mirrored fast swings, wrist rolls, gradual vertical→flat and abrupt stop remain continuous without added normal-motion lag',()=>{
 const poses=[new PalmPose(),new PalmPose()],filters=[new MotionFilter(),new MotionFilter()];let last=poses.map(()=>new Quaternion());
 for(let i=0;i<180;i++){
  const t=i*1000/24,q=new Quaternion().setFromEuler(new Euler(-Math.min(1,i/60)*Math.PI/2,Math.sin(Math.min(i,150)*.09)*1.5,Math.sin(Math.min(i,150)*.12)*.5)),hands=pair(q);
  for(let j=0;j<2;j++){update(poses[j],hands[j],1000+t);if(i)assert.ok(poses[j].rotation.angleTo(last[j])<.65);assert.ok(poses[j].direction.distanceTo(new Vector3(0,1,0).applyQuaternion(hands[j].rotation))<1e-5);last[j].copy(poses[j].rotation);filters[j].push(new Vector3(),poses[j].rotation,1000+t,1000+t,poses[j].reliable);filters[j].sample(1008+t);}
  checkMirror(...poses);
 }
 for(const f of filters){f.sample(10000);const q=f.rotation.clone();f.sample(12000);assert.ok(q.angleTo(f.rotation)<1e-6);}
});
test('world-only depth inversion and sustained ambiguous flat-palm reversal do not turn either blade toward player',()=>{
 const q=new Quaternion().setFromEuler(new Euler(-Math.PI/2,0,0));
 for(const side of ['Left','Right']){
  const good=anatomicalHand(side,q),pose=new PalmPose(),old=new Phase13Pose();update(pose,good,1000);update(old,good,1000);
  const bad={...good,world:good.world.map(p=>({...p,z:2*good.world[0].z-p.z}))};
  for(let i=0;i<8;i++){update(pose,bad,1042+i*42);update(old,bad,1042+i*42);assert.ok(pose.direction.z<-.99);}
  assert.ok(old.direction.z>.8,'reproduces the old two-packet acceptance of a world-depth flip');
  const ambiguous=anatomicalHand(side,new Quaternion().setFromEuler(new Euler(Math.PI/2,0,0)));
  for(let i=0;i<8;i++)update(pose,ambiguous,1500+i*42);assert.ok(pose.direction.z<-.99);
  // A genuine reverse is allowed through a continuous wrist path, not a depth sign lock.
  for(let i=0;i<=90;i++)update(pose,anatomicalHand(side,new Quaternion().setFromEuler(new Euler(-Math.PI/2+i/90*Math.PI,0,0))),2000+i*42);
  assert.ok(pose.direction.z>.99);
 }
});
test('bad MCP transverse/roll cannot freeze a valid finger direction or trigger angular prediction',()=>{
 for(const side of ['Left','Right']){
  const pose=new PalmPose(),old=new Phase13Pose(),initial=anatomicalHand(side);update(pose,initial,1000);update(old,initial,1000);
  const next=anatomicalHand(side,new Quaternion().setFromEuler(new Euler(-.25,0,0))),bad={...next,world:next.world.map(p=>({...p}))};[bad.world[5],bad.world[17]]=[bad.world[17],bad.world[5]];
  update(pose,bad,1042);update(old,bad,1042);assert.ok(pose.direction.distanceTo(new Vector3(0,1,0).applyQuaternion(next.rotation))<1e-5);assert.ok(old.direction.distanceTo(pose.direction)>.2,'old roll guard froze the entire pose');assert.equal(pose.reliable,false);
  const filter=new MotionFilter();filter.push(new Vector3(),new Quaternion(),1000,1000);filter.push(new Vector3(),pose.rotation,1042,1042,pose.reliable);filter.sample(1064);assert.equal(filter.predictedAngle,0);
 }
});
test('short occlusion recovery and partial world landmarks stay bilateral, finite and bounded',()=>{
 const poses=[new PalmPose(),new PalmPose()];for(let i=0;i<20;i++){const hands=pair(new Quaternion().setFromEuler(new Euler(-i*.035,i*.03,0)));hands.forEach((h,j)=>update(poses[j],h,1000+i*42));}
 const hands=pair(new Quaternion().setFromEuler(new Euler(-1.3,.6,0)));hands.forEach((h,j)=>{h.world[5].z=NaN;update(poses[j],h,2010);assert.ok(poses[j].deltaDegrees<=20.1);assert.equal(poses[j].reliable,false);});checkMirror(...poses);
 for(let i=0;i<15;i++)pair(new Quaternion().setFromEuler(new Euler(-1.3,.6,0))).forEach((h,j)=>update(poses[j],h,2052+i*42));checkMirror(...poses);assert.ok(poses.every(p=>Number.isFinite(p.rotation.w)));
});
test('temporal ownership survives output-order changes, label swap/duplicates, crossing and brief occlusion',()=>{
 const assignment=new HandAssignment();let time=1000;
 const send=(xLeft,xRight,labels,reverse=false)=>{const hands=[anatomicalHand('Left',new Quaternion(),xLeft),anatomicalHand('Right',new Quaternion(),xRight)];const data=detections(hands,time,labels);time+=42;if(reverse){data.landmarks.reverse();data.handedness.reverse();hands.reverse();}const chosen=assignment.assign(data);for(const a of chosen)assert.equal(hands[a.index].side,a.side);return chosen;};
 send(.72,.28);send(.70,.30,['Left','Right']);send(.68,.32,['Right','Right'],true);
 for(let i=0;i<=20;i++)send(.66-i*.018,.34+i*.018,undefined,i%2===0);
 time+=180;send(.25,.75);assert.equal(send(.23,.77).length,2);
 const overlap=assignment.assign(detections([anatomicalHand('Left',new Quaternion(),.5),anatomicalHand('Right',new Quaternion(),.5)],time));time+=42;assert.equal(overlap.length,0);
 send(.22,.78);const single=anatomicalHand('Right',new Quaternion(),.79);const selected=assignment.assign(detections([single],time,['Right']));assert.deepEqual(selected,[{side:'Right',index:0}]);
});

test('both anatomical hands can point in the same world direction; red-only corruption cannot disturb blue',()=>{
 const assignment=new HandAssignment(),poses={Left:new PalmPose(),Right:new PalmPose()},prior={Left:new Quaternion(),Right:new Quaternion()},seen=new Set();
 for(let frame=0;frame<100;frame++){
  const time=1000+frame*42,q=new Quaternion().setFromEuler(new Euler(-1.35,Math.sin(frame*.04)*.2,Math.sin(frame*.03)*.2));
  const left=anatomicalHand('Left',q),right=anatomicalHand('Right',q);const expected=new Vector3(0,1,0).applyQuaternion(q);
  if(frame%11>=6&&frame%11<=8)right.world=right.world.map(p=>({...p,z:2*right.world[0].z-p.z}));
  const hands=frame>=40&&frame<45?[left]:[left,right],data=detections(hands,time,frame%9===0?hands.map(()=> 'Right'):undefined);
  for(const {side,index} of assignment.assign(data)){
   assert.equal(hands[index].side,side);const pose=poses[side];update(pose,hands[index],time);assert.ok(pose.direction.distanceTo(expected)<.04);if(seen.has(side))assert.ok(pose.rotation.angleTo(prior[side])<.2);seen.add(side);prior[side].copy(pose.rotation);
  }
  assert.ok(poses.Left.direction.distanceTo(expected)<1e-5,'healthy blue hand keeps its unfiltered direction');
 }
});

test('edge-on degenerate transverse and previous roll cannot produce a zero/reflected basis',()=>{
 for(const side of ['Left','Right']){
  const pose=new PalmPose(),initial=anatomicalHand(side,new Quaternion().setFromEuler(new Euler(0,Math.PI/2,0)));update(pose,initial,1000);
  const next=anatomicalHand(side,new Quaternion().setFromEuler(new Euler(-Math.PI/2,0,0)));
  const w=next.world[0];next.world[5]={x:w.x,y:w.y,z:w.z-.03};next.world[17]={x:w.x,y:w.y,z:w.z-.09};
  for(let i=0;i<10;i++){update(pose,next,1042+i*42);assert.ok(Number.isFinite(pose.rotation.w));assert.ok(Math.abs(new Matrix4().makeRotationFromQuaternion(pose.rotation).determinant()-1)<1e-6);assert.ok(Math.abs(pose.direction.length()-1)<1e-6);}
 }
});

test('regular slow inference does not repeatedly trigger occlusion recovery or add an angular speed cap',()=>{
 for(const side of ['Left','Right']){
  const pose=new PalmPose();for(let i=0;i<12;i++){
   const q=new Quaternion().setFromEuler(new Euler(-.4*Math.sin(i*.9),0,0)),h=anatomicalHand(side,q);update(pose,h,1000+i*200);
   assert.ok(pose.rotation.angleTo(q)<1e-5);assert.equal(pose.status,'世界座標');assert.equal(pose.reliable,true);
  }
 }
});
