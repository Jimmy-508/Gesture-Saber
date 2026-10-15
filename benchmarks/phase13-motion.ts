import {Vector3,Quaternion,MathUtils} from 'three';
/** Arrival interpolation + bounded prediction; capture time is never confused with arrival time. */
export class MotionFilter {
 readonly position=new Vector3();readonly rotation=new Quaternion();
 private startP=new Vector3();private startQ=new Quaternion();private targetP=new Vector3();private targetQ=new Quaternion();
 private lastP=new Vector3();private lastQ=new Quaternion();private velocity=new Vector3();private deltaQ=new Quaternion();private turn=new Quaternion();private deltaAngle=0;private predictedQ=new Quaternion();private predictedP=new Vector3();
 lastSample=-Infinity;arrival=-Infinity;private period=42;private transition=20;private angular=0;private predictedAngle=0;
 speed=0;lagMs=0;
 push(p:Vector3,q:Quaternion,time:number,arrived:number){
  if(time<=this.lastSample)return;
  // Advance the previous segment before replacing it. Equal-rate input/render must not stall at t=0.
  if(Number.isFinite(this.lastSample))this.sample(arrived);
  const gap=time-this.lastSample;
  if(gap>250||p.distanceTo(this.lastP)>2.5){this.position.copy(p);this.rotation.copy(q);this.targetP.copy(p);this.targetQ.copy(q);this.velocity.set(0,0,0);this.angular=0;this.speed=0;}
  else{
   const seconds=gap/1000,distance=p.distanceTo(this.lastP),angle=q.angleTo(this.lastQ);
   this.period=MathUtils.clamp(gap,16,140);this.speed=Math.min(24,(distance+angle*2.75)/seconds);
   const alpha=1-Math.exp(-seconds*(35+this.speed*12));this.targetP.lerp(p,alpha);this.targetQ.slerp(q,alpha);
   this.velocity.subVectors(p,this.lastP).divideScalar(seconds).clampLength(0,14);
   this.angular=angle<.002?0:Math.min(9,angle/seconds);this.deltaAngle=angle;this.deltaQ.copy(this.lastQ).invert().multiply(q);
   if(distance<.002)this.velocity.set(0,0,0);
  }
  this.startP.copy(this.position);this.startQ.copy(this.rotation);this.lastP.copy(p);this.lastQ.copy(q);
  this.lastSample=time;this.arrival=arrived;this.transition=MathUtils.clamp(this.period*.65/(1+this.speed*.22),8,32);
 }
 sample(now:number){
  if(!Number.isFinite(this.lastSample))return;
  const age=now-this.arrival,sourceAge=now-this.lastSample;
  // Prediction fades to zero before tracking is stale; no indefinite dead reckoning.
  const horizon=age<80?Math.min(Math.max(age,0),22)/1000*Math.max(0,1-Math.max(0,age-45)/35)*MathUtils.clamp((180-sourceAge)/40,0,1):0;
  this.predictedP.copy(this.velocity).multiplyScalar(horizon).clampLength(0,.12).add(this.targetP);
  this.predictedQ.copy(this.targetQ);this.predictedAngle=Math.min(.12,this.angular*horizon);
  if(this.predictedAngle>0){const fraction=this.deltaAngle>.0001?this.predictedAngle/this.deltaAngle:0;this.turn.identity().slerp(this.deltaQ,Math.min(1,fraction));this.predictedQ.multiply(this.turn);}
  const t=MathUtils.clamp(age/this.transition,0,1);
  this.position.lerpVectors(this.startP,this.predictedP,t);this.rotation.slerpQuaternions(this.startQ,this.predictedQ,t);
  this.lagMs=this.speed>.1?Math.min(150,(this.position.distanceTo(this.lastP)+this.rotation.angleTo(this.lastQ)*2.75)/this.speed*1000):0;
 }
 reset(){this.lastSample=this.arrival=-Infinity;this.speed=0;this.velocity.set(0,0,0);this.angular=0;}
}
