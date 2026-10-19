import {Vector3,Quaternion,Matrix4} from 'three';
import type {Point,Side} from './gesture.ts';
const finite=(p:Point|undefined):p is Point=>!!p&&[p.x,p.y,p.z].every(Number.isFinite);
const imagePoint=(p:Point|undefined):p is Point=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<3&&Math.abs(p.y)<3;
/** Independent geometric estimate: no animation, angular rate limiting or prediction. */
export class ControlPose{
 readonly position=new Vector3();readonly rotation=new Quaternion();readonly direction=new Vector3(0,1,0);
 source:'WORLD'|'IMAGE'|'HOLD'='HOLD';reliable=false;reason='尚未觀測';holds=0;
 private ready=false;private offsetX=0;private offsetY=0;
 private y=new Vector3();private x=new Vector3();private z=new Vector3();private imageY=new Vector3();private imageX=new Vector3();private oldY=new Vector3(0,1,0);private oldX=new Vector3(1,0,0);
 private pending=new Vector3();private pendingCount=0;private rollPending=new Vector3();private rollCount=0;private swing=new Quaternion();private candidate=new Quaternion();private matrix=new Matrix4();
 reset(){this.ready=false;this.pendingCount=this.rollCount=this.holds=0;this.offsetX=this.offsetY=0;this.rotation.identity();this.direction.set(0,1,0);this.source='HOLD';this.reliable=false;this.reason='尚未觀測';}
 private axis(p:Point[]|undefined,out:Vector3,aspect:number){
  if(!p||!finite(p[0]))return false;const wrist=p[0];let n=0,x=0,y=0,z=0;
  if(finite(p[9])){x=p[9].x;y=p[9].y;z=p[9].z;n=1;}else for(const i of [5,13,17])if(finite(p[i])){x+=p[i].x;y+=p[i].y;z+=p[i].z;n++;}
  if(!n)return false;out.set(-(x/n-wrist.x),-(y/n-wrist.y)/aspect,z/n-wrist.z);const length=out.length();return Number.isFinite(length)&&length>1e-4&&length<4;
 }
 private across(p:Point[]|undefined,out:Vector3,side:Side,aspect:number){
  if(!p)return false;const pairs=[[5,17],[5,13],[9,17]];for(const [a,b] of pairs)if(finite(p[a])&&finite(p[b])){out.set(-(p[a].x-p[b].x),-(p[a].y-p[b].y)/aspect,p[a].z-p[b].z).multiplyScalar(side==='Left'?1:-1);const length=out.length();return Number.isFinite(length)&&length>1e-4&&length<4;}return false;
 }
 update(points:Point[],world:Point[]|undefined,side:Side,viewAspect:number,imageAspect=4/3){
  if(!Number.isFinite(imageAspect)||imageAspect<=0)imageAspect=4/3;if(!Number.isFinite(viewAspect)||viewAspect<=0)viewAspect=1;
  // Position remains usable independently of direction. Depth is a fixed interaction
  // plane; projected palm width is not a reliable estimate of wrist distance.
  let n=0,cx=0,cy=0;for(const i of [5,9,17])if(imagePoint(points[i])){cx+=points[i].x;cy+=points[i].y;n++;}
  const wrist=points[0];let px:number,py:number;
  if(imagePoint(wrist)){if(n===3){this.offsetX=(cx/n-wrist.x)*.75;this.offsetY=(cy/n-wrist.y)*.75;}px=wrist.x+this.offsetX;py=wrist.y+this.offsetY;}
  else if(n){px=cx/n-this.offsetX/3;py=cy/n-this.offsetY/3;}
  else{let count=0;px=py=0;for(const p of points)if(imagePoint(p)){px+=p.x;py+=p.y;count++;}if(!count)return false;px/=count;py/=count;}
  const height=2*Math.tan(21.5*Math.PI/180)*11;this.position.set(Math.max(-1.2,Math.min(1.2,.5-px))*height*viewAspect,Math.max(-1.2,Math.min(1.2,.5-py))*height+1,0);
  const imageValid=this.axis(points,this.imageY,imageAspect);if(imageValid)this.imageY.normalize();
  let worldValid=this.axis(world,this.y,1);const length=this.y.length();worldValid=worldValid&&length>.015&&length<.22;if(worldValid)this.y.normalize();
  if(worldValid&&imageValid&&this.y.dot(this.imageY)<.2)worldValid=false;
  this.reliable=worldValid;this.source=worldValid?'WORLD':imageValid?'IMAGE':'HOLD';this.reason=worldValid?'世界指向':imageValid?'影像指向備援':'無方向：保留旋轉，位置仍更新';
  if(!worldValid){if(!imageValid){this.holds++;return true;}this.y.copy(this.imageY);}
  // A depth-only sign reversal is ambiguous. A real large turn needs two consistent
  // observations; ordinary wrist turns including 90 degrees pass immediately.
  const dot=this.ready?this.y.dot(this.direction):1;
  if(this.ready&&dot<-.5){
   const depthOnly=this.y.z*this.direction.z<-.35&&Math.hypot(this.y.x-this.direction.x,this.y.y-this.direction.y)<.25;
   this.pendingCount=this.pending.dot(this.y)>.95?this.pendingCount+1:1;this.pending.copy(this.y);
   if(depthOnly||this.pendingCount<2){this.source='HOLD';this.reliable=false;this.reason=depthOnly?'深度反向歧義：保留方向':'大幅轉向確認中';this.holds++;return true;}
  }else this.pendingCount=0;
  this.oldY.copy(this.direction);this.oldX.set(1,0,0).applyQuaternion(this.rotation);this.swing.setFromUnitVectors(this.oldY,this.y);this.oldX.applyQuaternion(this.swing);
  let transverse=this.across(worldValid?world:points,this.x,side,worldValid?1:imageAspect);
  if(transverse){this.x.addScaledVector(this.y,-this.x.dot(this.y));transverse=this.x.lengthSq()>1e-6;}
  if(worldValid&&transverse&&this.across(points,this.imageX,side,imageAspect)){this.imageX.addScaledVector(this.y,-this.imageX.dot(this.y));if(this.imageX.lengthSq()>1e-6&&this.imageX.dot(this.x)<0){this.x.copy(this.imageX);this.reliable=false;this.reason='掌面矛盾：使用影像橫軸';}}
  if(!transverse){this.x.copy(this.oldX);this.reliable=false;this.reason='橫軸不可靠：平行搬移舊橫軸';}
  this.x.addScaledVector(this.y,-this.x.dot(this.y));if(this.x.lengthSq()<1e-6){this.x.set(Math.abs(this.y.x)<.8?1:0,Math.abs(this.y.x)<.8?0:1,0);this.x.addScaledVector(this.y,-this.x.dot(this.y));}
  this.x.normalize();if(this.ready&&this.x.dot(this.oldX)<-.5){this.rollCount=this.rollPending.dot(this.x)>.95?this.rollCount+1:1;this.rollPending.copy(this.x);if(this.rollCount<2){this.x.copy(this.oldX);this.reliable=false;this.reason='單次掌面反轉：保留橫軸';this.holds++;}}else this.rollCount=0;
  this.x.normalize();this.z.crossVectors(this.x,this.y).normalize();this.x.crossVectors(this.y,this.z).normalize();this.matrix.makeBasis(this.x,this.y,this.z);this.candidate.setFromRotationMatrix(this.matrix).normalize();
  if(this.ready&&this.rotation.dot(this.candidate)<0)this.candidate.set(-this.candidate.x,-this.candidate.y,-this.candidate.z,-this.candidate.w);
  this.rotation.copy(this.candidate);this.direction.copy(this.y);this.ready=true;return true;
 }
}
