import {Vector3,Quaternion,Matrix4} from 'three';
import type {Point,Side} from '../src/gesture';
/** Mirror X, Y up, preserve Z: fingers approaching the front camera extend into
 * scene -Z, away from the player. A rotation about Z, not a three-axis reflection. */
export class PalmPose {
 readonly rotation=new Quaternion();readonly direction=new Vector3(0,1,0);
 private x=new Vector3(1,0,0);private y=new Vector3();private z=new Vector3();private a=new Vector3();private b=new Vector3();private oldX=new Vector3();
 private matrix=new Matrix4();private candidate=new Quaternion();private pending=new Vector3();private pendingCount=0;private last=-Infinity;private ready=false;
 private rollCandidate=new Quaternion();private rollCount=0;
 reset(){this.ready=false;this.last=-Infinity;this.pendingCount=this.rollCount=0;}
 update(points:Point[],world:Point[]|undefined,side:Side,time:number,aspect=1){
  if(time<=this.last)return this.rotation;
  const finite=(p:Point|undefined)=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z);
  const usable=(p:Point[]|undefined)=>p&&[0,5,9,17].every(i=>finite(p[i]));
  const length=usable(world)?Math.hypot(world![9].x-world![0].x,world![9].y-world![0].y,world![9].z-world![0].z):0;
  const validWorld=length>.015&&length<.22,source=validWorld?world!:points;
  if(!finite(source[0])||!finite(source[5])||!finite(source[17]))return this.rotation;
  const map=(p:Point,v:Vector3)=>v.set(-p.x,-p.y,p.z);
  map(source[0],this.a);
  if(finite(source[9]))map(source[9],this.y);else{map(source[5],this.y);map(source[17],this.b);this.y.add(this.b).multiplyScalar(.5);}
  this.y.sub(this.a);map(source[5],this.x);map(source[17],this.b);this.x.sub(this.b).multiplyScalar(side==='Left'?1:-1);
  // Normalized x/z use image width, y uses height. Do not mix metric and normalized axes.
  if(!validWorld){this.y.y/=aspect;this.x.y/=aspect;}
  if(this.y.lengthSq()<1e-8)return this.rotation;this.y.normalize();
  const dt=Math.min(.065,Math.max(.008,(time-this.last)/1000)),continuous=this.ready&&time-this.last<1000;
  if(continuous&&this.y.dot(this.direction)<.25){
   if(this.pending.dot(this.y)>.94)this.pendingCount++;else{this.pending.copy(this.y);this.pendingCount=1;}
   if(this.pendingCount<2){this.last=time;return this.rotation;}
  }else this.pendingCount=0;
  this.x.addScaledVector(this.y,-this.x.dot(this.y));
  if(this.x.lengthSq()<1e-6){
   this.oldX.set(1,0,0).applyQuaternion(this.rotation);this.x.copy(this.oldX).addScaledVector(this.y,-this.oldX.dot(this.y));
   if(this.x.lengthSq()<1e-6)this.x.set(0,0,1).addScaledVector(this.y,-this.y.z);
  }
  this.x.normalize();this.z.crossVectors(this.x,this.y).normalize();this.x.crossVectors(this.y,this.z).normalize();
  this.matrix.makeBasis(this.x,this.y,this.z);this.candidate.setFromRotationMatrix(this.matrix).normalize();
  // Near edge-on, MCP order/depth can reverse the normal while the finger axis barely moves.
  // A real half-turn remains possible, but a solitary unreliable roll cannot flip the hilt.
  if(continuous&&this.y.dot(this.direction)>.8&&this.rotation.angleTo(this.candidate)>2.1){
   if(this.rollCandidate.angleTo(this.candidate)<.3)this.rollCount++;else{this.rollCandidate.copy(this.candidate);this.rollCount=1;}
   if(this.rollCount<2){this.last=time;return this.rotation;}
  }else this.rollCount=0;
  if(this.rotation.dot(this.candidate)<0)this.candidate.set(-this.candidate.x,-this.candidate.y,-this.candidate.z,-this.candidate.w);
  if(continuous)this.rotation.rotateTowards(this.candidate,22*dt);else this.rotation.copy(this.candidate);
  this.direction.set(0,1,0).applyQuaternion(this.rotation);this.ready=true;this.last=time;return this.rotation;
 }
}
