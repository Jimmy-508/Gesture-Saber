import {Vector3,Quaternion,Matrix4} from 'three';
import type {Point,Side} from './gesture';
/** Mirror X, Y up, preserve Z: fingers approaching the front camera extend into
 * scene -Z, away from the player. A rotation about Z, not a three-axis reflection. */
export class PalmPose {
 readonly rotation=new Quaternion();readonly direction=new Vector3(0,1,0);
 reliable=false;status='尚未觀測';deltaDegrees=0;
 private imageAxis=new Vector3();private lastImageAxis=new Vector3();private previous=new Quaternion();private recovery=0;
 private cadence=42;private observations=0;
 private x=new Vector3(1,0,0);private y=new Vector3();private z=new Vector3();private a=new Vector3();private b=new Vector3();private oldX=new Vector3();
 private matrix=new Matrix4();private candidate=new Quaternion();private pending=new Vector3();private pendingCount=0;private last=-Infinity;private ready=false;
 reset(){this.ready=false;this.last=-Infinity;this.pendingCount=this.recovery=this.observations=0;this.cadence=42;this.reliable=false;this.status='尚未觀測';this.deltaDegrees=0;}
 update(points:Point[],world:Point[]|undefined,side:Side,time:number,aspect=1){
  if(time<=this.last)return this.rotation;
  this.reliable=true;this.status='世界座標';this.previous.copy(this.rotation);
  const finite=(p:Point|undefined)=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z);
  const usable=(p:Point[]|undefined)=>p&&[0,5,9,17].every(i=>finite(p[i]));
  const length=usable(world)?Math.hypot(world![9].x-world![0].x,world![9].y-world![0].y,world![9].z-world![0].z):0;
  const width=usable(world)?Math.hypot(world![5].x-world![17].x,world![5].y-world![17].y,world![5].z-world![17].z):0;
  let validWorld=length>.015&&length<.22&&width>.015&&width<.16;
  const imageValid=[0,5,17].every(i=>finite(points[i]));
  if(imageValid){const middle=finite(points[9])?points[9]:{x:(points[5].x+points[17].x)/2,y:(points[5].y+points[17].y)/2,z:(points[5].z+points[17].z)/2};this.imageAxis.set(-(middle.x-points[0].x),-(middle.y-points[0].y)/aspect,middle.z-points[0].z).normalize();}
  // World and image landmarks have independent scales, but wrist-relative depth signs
  // should agree. A world-depth inversion must not override a consistent image estimate.
  if(validWorld&&imageValid){this.a.set(-(world![9].x-world![0].x),-(world![9].y-world![0].y),world![9].z-world![0].z).normalize();if(this.a.dot(this.imageAxis)<.35)validWorld=false;}
  const source=validWorld?world!:points;
  if(!finite(source[0])||!finite(source[5])||!finite(source[17])){this.reliable=false;this.status='關鍵點不足：保留姿態';return this.rotation;}
  if(!validWorld){this.reliable=false;this.status='影像座標備援';}
  const map=(p:Point,v:Vector3)=>v.set(-p.x,-p.y,p.z);
  map(source[0],this.a);
  if(finite(source[9]))map(source[9],this.y);else{map(source[5],this.y);map(source[17],this.b);this.y.add(this.b).multiplyScalar(.5);}
  this.y.sub(this.a);map(source[5],this.x);map(source[17],this.b);this.x.sub(this.b).multiplyScalar(side==='Left'?1:-1);
  // Normalized x/z use image width, y uses height. Do not mix metric and normalized axes.
  if(!validWorld){this.y.y/=aspect;this.x.y/=aspect;}
  if(this.y.lengthSq()<1e-8){this.reliable=false;return this.rotation;}this.y.normalize();
  const gap=time-this.last,dt=Math.min(.065,Math.max(.008,gap/1000)),continuous=this.ready&&gap<1000;
  // Slow, regular inference is not an occlusion. Learn its cadence before applying recovery limits.
  this.recovery=continuous&&this.observations>=2&&gap>Math.max(150,this.cadence*2.5)?4:Math.max(0,this.recovery-1);let held=false;
  if(continuous)this.cadence=this.observations<2?gap:this.cadence+(Math.min(gap,500)-this.cadence)*.35;
  if(continuous&&this.y.dot(this.direction)<.25){
   const depthOnly=imageValid&&gap<250&&this.y.z*this.direction.z<-.2&&Math.hypot(this.imageAxis.x-this.lastImageAxis.x,this.imageAxis.y-this.lastImageAxis.y)<.3;
   if(this.pending.dot(this.y)>.94)this.pendingCount++;else{this.pending.copy(this.y);this.pendingCount=1;}
   if(depthOnly||this.pendingCount<2){this.y.copy(this.direction);held=true;this.reliable=false;this.status=depthOnly?'深度歧義：保留指向':'突變確認中';}
  }else this.pendingCount=0;
  this.oldX.set(1,0,0).applyQuaternion(this.rotation);this.oldX.addScaledVector(this.y,-this.oldX.dot(this.y));
  this.x.addScaledVector(this.y,-this.x.dot(this.y));
  const degenerate=this.x.lengthSq()<1e-6;
  // Reject unreliable roll alone: valid wrist→finger direction still updates this frame.
  const reversed=continuous&&!this.recovery&&this.oldX.lengthSq()>1e-6&&!degenerate&&this.x.dot(this.oldX)/Math.sqrt(this.x.lengthSq()*this.oldX.lengthSq())<-.5;
  if(degenerate||reversed||held){
   this.x.copy(this.oldX);this.reliable=false;if(!held)this.status='掌面歧義：保留旋轉基準';
   if(this.x.lengthSq()<1e-6){this.x.set(Math.abs(this.y.x)<.8?1:0,Math.abs(this.y.x)<.8?0:1,0);this.x.addScaledVector(this.y,-this.x.dot(this.y));}
  }
  this.x.normalize();this.z.crossVectors(this.x,this.y).normalize();this.x.crossVectors(this.y,this.z).normalize();
  this.matrix.makeBasis(this.x,this.y,this.z);this.candidate.setFromRotationMatrix(this.matrix).normalize();
  if(this.rotation.dot(this.candidate)<0)this.candidate.set(-this.candidate.x,-this.candidate.y,-this.candidate.z,-this.candidate.w);
  if(continuous)this.rotation.rotateTowards(this.candidate,this.recovery?.35:22*dt);else this.rotation.copy(this.candidate);
  if(this.recovery){this.reliable=false;if(this.status==='世界座標')this.status='遮擋後姿態銜接';}
  this.deltaDegrees=this.ready?this.previous.angleTo(this.rotation)*180/Math.PI:0;
  if(imageValid&&!held)this.lastImageAxis.copy(this.imageAxis);
  this.direction.set(0,1,0).applyQuaternion(this.rotation);this.observations++;this.ready=true;this.last=time;return this.rotation;
 }
}
