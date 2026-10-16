import {Vector3,Quaternion,MathUtils} from 'three';
/** Arrival interpolation + bounded prediction; capture time is never confused with arrival time. */
export class MotionFilter {
 readonly position=new Vector3();readonly rotation=new Quaternion();
 private startP=new Vector3();private startQ=new Quaternion();private targetP=new Vector3();private targetQ=new Quaternion();
 private lastP=new Vector3();private lastQ=new Quaternion();private velocity=new Vector3();private deltaQ=new Quaternion();private turn=new Quaternion();private deltaAngle=0;private predictedQ=new Quaternion();private predictedP=new Vector3();
 lastSample=-Infinity;arrival=-Infinity;private period=42;private transition=20;private rotationTransition=20;private angular=0;private predictedAngle=0;private frozen=false;
 private previousRate=0;private previousTurn=new Quaternion();private rotationRate=0;private linearRate=0;private rotationStopping=false;
 speed=0;lagMs=0;positionError=0;positionLagMs=0;rotationErrorRad=0;rotationLagMs=0;rotationPredictionActive=false;rotationPredictionCapped=false;
 push(p:Vector3,q:Quaternion,time:number,arrived:number,predictRotation=true){
  if(time<=this.lastSample)return;
  this.rotationStopping=false;
  // Advance the previous segment before replacing it. Equal-rate input/render must not stall at t=0.
  if(Number.isFinite(this.lastSample))this.sample(arrived);
  const gap=time-this.lastSample,recovering=this.frozen||gap>250||p.distanceTo(this.lastP)>2.5;
  if(!Number.isFinite(this.lastSample)){this.position.copy(p);this.rotation.copy(q);this.targetP.copy(p);this.targetQ.copy(q);this.velocity.set(0,0,0);this.angular=0;this.speed=0;}
  else{
   const seconds=gap/1000,distance=p.distanceTo(this.lastP),angle=q.angleTo(this.lastQ);
   this.period=MathUtils.clamp(gap,16,140);this.speed=Math.min(24,(distance+angle*2.75)/seconds);
   const alpha=1-Math.exp(-seconds*(35+this.speed*12));this.targetP.lerp(p,alpha);
   // Position keeps its existing path. Quiet rotation rejects micro jitter; deliberate
   // turns use a faster cutoff and an independent, short visual transition.
   this.rotationRate=angle/seconds;
   this.linearRate=distance/seconds;
   this.rotationStopping=predictRotation&&this.previousRate>.5&&this.rotationRate<.12;
   this.velocity.subVectors(p,this.lastP).divideScalar(seconds).clampLength(0,14);
   this.deltaAngle=angle;this.deltaQ.copy(this.lastQ).invert().multiply(q);if(this.deltaQ.w<0)this.deltaQ.set(-this.deltaQ.x,-this.deltaQ.y,-this.deltaQ.z,-this.deltaQ.w);
   const dot=this.deltaQ.x*this.previousTurn.x+this.deltaQ.y*this.previousTurn.y+this.deltaQ.z*this.previousTurn.z;
   const lengths=Math.hypot(this.deltaQ.x,this.deltaQ.y,this.deltaQ.z)*Math.hypot(this.previousTurn.x,this.previousTurn.y,this.previousTurn.z);
   // A single jump, reversal or recovered sample is not evidence of continued motion.
   const continuous=predictRotation&&!recovering&&gap<=140&&this.rotationRate>.08&&this.previousRate>.08&&this.rotationRate/this.previousRate>.25&&this.rotationRate/this.previousRate<4&&lengths>1e-8&&dot/lengths>.7;
   const correction=this.targetQ.angleTo(q),drive=Math.max(continuous?this.rotationRate:0,Math.max(0,correction-.025)/seconds);
   const rotationalAlpha=1-Math.exp(-seconds*(predictRotation?30+drive*100:35+this.speed*12));this.targetQ.slerp(q,rotationalAlpha);
   this.angular=continuous?Math.min(9,this.rotationRate)*MathUtils.clamp(angle/.012,0,1):0;this.previousRate=predictRotation&&!recovering?this.rotationRate:0;this.previousTurn.copy(this.deltaQ);
   if(distance<.002)this.velocity.set(0,0,0);
  }
  this.startP.copy(this.position);this.startQ.copy(this.rotation);this.lastP.copy(p);this.lastQ.copy(q);
  this.frozen=false;this.lastSample=time;this.arrival=arrived;this.transition=recovering?32:MathUtils.clamp(this.period*.65/(1+this.speed*.22),8,32);
  const largeTurn=this.deltaAngle>Math.acos(.25);
  this.rotationTransition=recovering?32:predictRotation?(this.rotationStopping?6:MathUtils.clamp(this.period*.45/(1+this.rotationRate*2),largeTurn?20:6,24)):this.transition;
 }
 sample(now:number){
  if(!Number.isFinite(this.lastSample))return;
  const age=now-this.arrival,sourceAge=now-this.lastSample;
  // Prediction fades to zero before tracking is stale; no indefinite dead reckoning.
  const horizon=age<80?Math.min(Math.max(age,0),22)/1000*Math.max(0,1-Math.max(0,age-45)/35)*MathUtils.clamp((180-sourceAge)/40,0,1):0;
  this.predictedP.copy(this.velocity).multiplyScalar(horizon).clampLength(0,.12).add(this.targetP);
  // Compensate for bounded capture age too, rather than starting the horizon only
  // after inference arrives. The same 22ms / .12rad caps and stale stop remain.
  const rotationHorizon=age<80?Math.min(Math.max(sourceAge,0),22)/1000*Math.max(0,1-Math.max(0,age-45)/35)*MathUtils.clamp((180-sourceAge)/40,0,1):0;
  const desiredAngle=this.angular*rotationHorizon;this.predictedQ.copy(this.targetQ);this.predictedAngle=Math.min(.12,desiredAngle);this.rotationPredictionActive=this.predictedAngle>0;this.rotationPredictionCapped=desiredAngle>.12||desiredAngle>this.deltaAngle;
  if(this.predictedAngle>0){const fraction=this.deltaAngle>.0001?this.predictedAngle/this.deltaAngle:0;this.turn.identity().slerp(this.deltaQ,Math.min(1,fraction));this.predictedQ.multiply(this.turn);}
  const t=MathUtils.clamp(age/this.transition,0,1);
  this.position.lerpVectors(this.startP,this.predictedP,t);this.rotation.slerpQuaternions(this.startQ,this.predictedQ,MathUtils.clamp(age/this.rotationTransition,0,1));
  this.rotationErrorRad=this.rotation.angleTo(this.lastQ);this.rotationLagMs=this.rotationRate>.08?Math.min(150,this.rotationErrorRad/this.rotationRate*1000):0;
  this.positionError=this.position.distanceTo(this.lastP);this.positionLagMs=this.linearRate>.02?Math.min(150,this.positionError/this.linearRate*1000):0;
  this.lagMs=this.speed>.1?Math.min(150,(this.position.distanceTo(this.lastP)+this.rotation.angleTo(this.lastQ)*2.75)/this.speed*1000):0;
 }
 freeze(){this.frozen=true;this.velocity.set(0,0,0);this.angular=this.previousRate=0;this.rotationPredictionActive=this.rotationPredictionCapped=false;this.targetP.copy(this.position);this.startP.copy(this.position);this.targetQ.copy(this.rotation);this.startQ.copy(this.rotation);}
 reset(){this.frozen=false;this.lastSample=this.arrival=-Infinity;this.speed=this.rotationRate=this.linearRate=this.previousRate=this.positionError=this.positionLagMs=this.rotationErrorRad=this.rotationLagMs=0;this.rotationPredictionActive=this.rotationPredictionCapped=false;this.velocity.set(0,0,0);this.angular=0;}
}
