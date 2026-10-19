import {Vector3,Quaternion,Matrix4} from 'three';
import type {Point,Side} from './gesture.ts';
const FINGERS=[[5,6,7],[9,10,11],[13,14,15],[17,18,19]];
const valid=(p:Point|undefined):p is Point=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z);
/** Orientation strategy only. No position, identity, animation/filter or prediction.
 * A cylinder through a fist is normal to the fingers' flexion planes. It is NOT
 * the line through the MCP knuckles. Learn that axis in the palm frame at entry;
 * transport it with the palm thereafter, even when the fingers open. */
export class GripPose{
 readonly rotation=new Quaternion();readonly direction=new Vector3(0,1,0);
 calibrated=false;reliable=false;source='HOLD';reason='等待握持軸線';holds=0;
 private ready=false;private frame=new Quaternion();private imageFrame=new Quaternion();private inverse=new Quaternion();private candidate=new Quaternion();private matrix=new Matrix4();
 private x=new Vector3();private y=new Vector3();private z=new Vector3();private a=new Vector3();private b=new Vector3();private radial=new Vector3();private axis=new Vector3();private localAxis=new Vector3();private palmForward=new Vector3();private pending=new Quaternion();private confirmations=0;
 private normals=Array.from({length:4},()=>new Vector3());private weights=new Float32Array(4);
 reset(seed?:Quaternion){this.ready=this.calibrated=this.reliable=false;this.source='HOLD';this.reason='等待握持軸線';this.holds=this.confirmations=0;this.rotation.copy(seed??this.candidate.identity());this.direction.set(0,1,0).applyQuaternion(this.rotation);}
 private point(p:Point,out:Vector3,aspect:number){return out.set(-p.x,-p.y/aspect,p.z);}
 private palm(p:Point[]|undefined,side:Side,aspect:number,metric:boolean,out:Quaternion){
  if(!p||![0,5,9,17].every(i=>valid(p[i])))return false;
  this.point(p[9],this.y,aspect).sub(this.point(p[0],this.a,aspect));const length=this.y.length();if(length<(metric?.015:.005)||length>(metric?.22:1))return false;this.y.normalize();
  this.point(p[5],this.x,aspect).sub(this.point(p[17],this.a,aspect)).multiplyScalar(side==='Left'?1:-1);const width=this.x.length();if(width<(metric?.008:.004)||width>(metric?.18:1))return false;this.x.normalize().addScaledVector(this.y,-this.x.dot(this.y));if(this.x.lengthSq()<.08)return false;
  this.x.normalize();this.z.crossVectors(this.x,this.y).normalize();this.x.crossVectors(this.y,this.z).normalize();this.matrix.makeBasis(this.x,this.y,this.z);out.setFromRotationMatrix(this.matrix).normalize();return true;
 }
 private learn(p:Point[],aspect:number){
  if(!valid(p[2])||!valid(p[17]))return false;this.point(p[2],this.radial,aspect).sub(this.point(p[17],this.a,aspect));if(this.radial.lengthSq()<1e-8)return false;this.radial.normalize();
  let n=0;for(const [m,j,d] of FINGERS){if(![m,j,d].every(i=>valid(p[i])))continue;
   this.point(p[j],this.a,aspect).sub(this.point(p[m],this.b,aspect));this.point(p[d],this.b,aspect).sub(this.point(p[j],this.axis,aspect));const u=this.a.length(),v=this.b.length();if(u<1e-4||v<1e-4||u/v<.5||u/v>3)continue;
   const normal=this.normals[n].crossVectors(this.a,this.b).divideScalar(u*v),bend=normal.length();if(!Number.isFinite(bend)||bend<.35||this.a.dot(this.b)/(u*v)>.85)continue;normal.normalize();if(normal.dot(this.radial)<0)normal.negate();if(normal.dot(this.radial)<.35)continue;this.weights[n]=bend;n++;
  }
  if(n<2)return false;let best=0,count=0;for(let i=0;i<n;i++){let agree=0;for(let j=0;j<n;j++)if(this.normals[i].dot(this.normals[j])>.85)agree++;if(agree>count){count=agree;best=i;}}if(count<2)return false;
  this.axis.set(0,0,0);for(let i=0;i<n;i++)if(this.normals[best].dot(this.normals[i])>.85)this.axis.addScaledVector(this.normals[i],this.weights[i]);this.axis.normalize();
  this.inverse.copy(this.frame).invert();this.localAxis.copy(this.axis).applyQuaternion(this.inverse).normalize();this.calibrated=true;return true;
 }
 update(points:Point[],world:Point[]|undefined,side:Side,imageAspect=4/3){
  if(!Number.isFinite(imageAspect)||imageAspect<=0)imageAspect=4/3;
  const image=this.palm(points,side,imageAspect,false,this.imageFrame);let metric=this.palm(world,side,1,true,this.frame);
  if(metric&&image){this.a.set(0,1,0).applyQuaternion(this.frame);this.b.set(0,1,0).applyQuaternion(this.imageFrame);if(this.a.dot(this.b)<.2)metric=false;this.a.set(1,0,0).applyQuaternion(this.frame);this.b.set(1,0,0).applyQuaternion(this.imageFrame);if(this.a.dot(this.b)<-.2)metric=false;}
  if(!metric){if(!image)return this.hold('掌部方向不足，位置仍可更新');this.frame.copy(this.imageFrame);}
  if(!this.calibrated&&!this.learn(metric?world!:points,metric?1:imageAspect))return this.hold('握持彎曲平面不足，保留原旋轉');
  this.axis.copy(this.localAxis).applyQuaternion(this.frame).normalize();this.palmForward.set(0,1,0).applyQuaternion(this.frame);this.x.copy(this.palmForward).multiplyScalar(side==='Left'?-1:1);this.x.addScaledVector(this.axis,-this.x.dot(this.axis));if(this.x.lengthSq()<.08)return this.hold('握持軸線與掌部縱軸矛盾');
  this.x.normalize();this.z.crossVectors(this.x,this.axis).normalize();this.x.crossVectors(this.axis,this.z).normalize();this.matrix.makeBasis(this.x,this.axis,this.z);this.candidate.setFromRotationMatrix(this.matrix).normalize();
  // Confirm a gross discontinuity, without rate-limiting ordinary wrist turns.
  if(this.ready&&this.rotation.angleTo(this.candidate)>2.1){this.confirmations=this.pending.angleTo(this.candidate)<.15?this.confirmations+1:1;this.pending.copy(this.candidate);if(this.confirmations<2)return this.hold('大幅反轉確認中',false);}else this.confirmations=0;
  if(this.rotation.dot(this.candidate)<0)this.candidate.set(-this.candidate.x,-this.candidate.y,-this.candidate.z,-this.candidate.w);
  this.ready=true;this.rotation.copy(this.candidate);this.direction.copy(this.axis);this.reliable=true;this.source=metric?'WORLD':'IMAGE';this.reason='已校正握持軸線／掌部搬移';return true;
 }
 private hold(reason:string,clear=true){this.reliable=false;this.source='HOLD';this.reason=reason;this.holds++;if(clear)this.confirmations=0;return false;}
}
