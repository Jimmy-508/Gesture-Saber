import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Quaternion,Matrix4,Euler} from 'three';
import {PalmPose} from '../src/palm-pose.ts';
function hand(q,side){
 const inv=v=>{v.applyQuaternion(q);return {x:-v.x,y:-v.y,z:v.z}};
 const world=Array.from({length:21},()=>({x:0,y:0,z:0}));world[9]=inv(new Vector3(0,.08,0));const sign=side==='Left'?1:-1;
 world[5]=inv(new Vector3(.035*sign,.065,0));world[17]=inv(new Vector3(-.035*sign,.065,0));
 const points=world.map(v=>({x:.5+v.x,y:.5+v.y,z:v.z}));return {points,world};
}
test('both hands up/forward, palms up/down, tilt and roll have right-handed orthonormal basis and correct local +Y',()=>{
 for(const side of ['Left','Right'])for(const e of [[0,0,0],[-Math.PI/2,0,0],[-Math.PI/2,Math.PI,0],[0,0,-.7],[0,0,.7],[0,Math.PI,0]]){
  const expected=new Quaternion().setFromEuler(new Euler(...e)),f=hand(expected,side),pose=new PalmPose();pose.update(f.points,f.world,side,1000);
  assert.ok(pose.direction.distanceTo(new Vector3(0,1,0).applyQuaternion(expected))<1e-6);assert.ok(pose.rotation.angleTo(expected)<1e-6);
  const m=new Matrix4().makeRotationFromQuaternion(pose.rotation);assert.ok(Math.abs(m.determinant()-1)<1e-6);
 }
});
test('gradual vertical to flat, edge-on and independent wrist rotations remain continuous without delay',()=>{
 const left=new PalmPose(),right=new PalmPose();let previous=new Quaternion();
 for(let i=0;i<=90;i++){
  const q=new Quaternion().setFromEuler(new Euler(-i/90*Math.PI/2,Math.sin(i/20)*1.5,0)),f=hand(q,'Left');left.update(f.points,f.world,'Left',1000+i*42);
  assert.ok(left.rotation.angleTo(q)<1e-6);if(i)assert.ok(left.rotation.angleTo(previous)<.2);previous.copy(left.rotation);
  const r=hand(new Quaternion(),'Right');right.update(r.points,r.world,'Right',1000+i*42);assert.ok(right.direction.y>.999);
 }
 assert.ok(left.direction.z<-.999);
});
test('single-frame depth inversion is rejected; sustained genuine turn recovers, occlusion/stop/reacquisition stay finite',()=>{
 const pose=new PalmPose(),q=new Quaternion().setFromEuler(new Euler(-Math.PI/2,0,0)),f=hand(q,'Left');pose.update(f.points,f.world,'Left',1000);
 const bad=hand(new Quaternion().setFromEuler(new Euler(Math.PI/2,0,0)),'Left');pose.update(bad.points,bad.world,'Left',1042);assert.ok(pose.direction.z<-.99);
 pose.update(f.points,f.world,'Left',1084);assert.ok(pose.direction.z<-.99);
 for(let i=0;i<10;i++)pose.update(bad.points,bad.world,'Left',1126+i*42);assert.ok(pose.direction.z>.99,'forward/back are not locked');
 const occluded=hand(new Quaternion(),'Left');occluded.world[9]={x:NaN,y:NaN,z:NaN};occluded.points[9]={x:NaN,y:NaN,z:NaN};
 pose.update(occluded.points,occluded.world,'Left',1600);assert.ok(Number.isFinite(pose.rotation.w));
 for(let i=0;i<10;i++)pose.update(f.points,f.world,'Left',1700+i*42);const stopped=pose.rotation.clone();pose.update(f.points,f.world,'Left',2200);assert.ok(pose.rotation.angleTo(stopped)<1e-6);
 pose.update(f.points,f.world,'Left',2400);assert.ok(pose.direction.z<-.99);pose.reset();pose.update(f.points,f.world,'Left',2500);assert.ok(pose.direction.z<-.99);
});
test('missing/collinear landmarks hold a valid roll basis; normalized-only path accounts for aspect',()=>{
 const pose=new PalmPose(),f=hand(new Quaternion(),'Right');pose.update(f.points,f.world,'Right',1000);const old=pose.rotation.clone();
 const missing=f.world.map(p=>({...p}));missing[5].x=NaN;const empty=f.points.map(p=>({...p}));empty[5].x=NaN;pose.update(empty,missing,'Right',1042);assert.equal(pose.rotation.angleTo(old),0);
 const collinear=f.world.map(p=>({...p}));collinear[5]=collinear[17];pose.update(f.points,collinear,'Right',1084);assert.ok(pose.direction.y>.999);
 const normalized=new PalmPose();normalized.update(f.points,undefined,'Right',1000,1.5);assert.ok(normalized.direction.y>.999);
});

test('one-frame normal reversal does not flip roll, genuine gradual palm-up/down rotation is unrestricted',()=>{
 const pose=new PalmPose(),q=new Quaternion(),f=hand(q,'Left');pose.update(f.points,f.world,'Left',1000);
 const swapped=f.world.map(p=>({...p}));[swapped[5],swapped[17]]=[swapped[17],swapped[5]];pose.update(f.points,swapped,'Left',1042);assert.ok(pose.rotation.angleTo(q)<1e-6);
 for(let i=0;i<=60;i++){const expected=new Quaternion().setFromEuler(new Euler(0,i/60*Math.PI,0)),g=hand(expected,'Left');pose.update(g.points,g.world,'Left',1084+i*42);assert.ok(pose.rotation.angleTo(expected)<1e-6);}
});
