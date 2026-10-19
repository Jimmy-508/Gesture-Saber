import {Vector3,Quaternion} from 'three';
import type {Side} from './gesture.ts';
import {ControlIdentity,type ControlInput,type RawHand} from './control-identity.ts';
import {ControlPose} from './control-pose.ts';
import {TRACKING} from './tracking-state.ts';
export type ControlMode='modern'|'legacy';
const SIDES:Side[]=['Left','Right'];
/** One render-time exponential response. No filtered target, interpolation history,
 * angular chase limiter, velocity extrapolation or dependency on the legacy core. */
export class ControlHand{
 readonly pose=new ControlPose();readonly position=new Vector3();readonly rotation=new Quaternion();readonly targetRotation=new Quaternion();
 private startP=new Vector3();private startQ=new Quaternion();private arrival=-Infinity;private sampleTime=-Infinity;private positionTau=.008;private rotationTau=.004;private ready=false;
 lastSeen=-Infinity;frozen=false;updates=0;freezes=0;rawLabel='Unknown';rawScore=0;
 get time(){return this.sampleTime;}
 reset(){this.pose.reset();this.ready=false;this.arrival=this.sampleTime=this.lastSeen=-Infinity;this.position.set(0,0,0);this.rotation.identity();this.targetRotation.identity();this.frozen=false;this.updates=this.freezes=0;this.rawLabel='Unknown';this.rawScore=0;}
 push(data:ControlInput,index:number,side:Side,arrived:number,viewAspect:number,fresh=false,rotationOverride?:Quaternion){
  if(fresh){const updates=this.updates,freezes=this.freezes,holds=this.pose.holds;this.reset();this.updates=updates;this.freezes=freezes;this.pose.holds=holds;}else this.sample(arrived);
  const recovered=this.frozen||arrived-this.lastSeen>TRACKING.staleMs;
  if(!this.pose.update(data.landmarks[index],data.world?.[index],side,viewAspect,data.aspect??4/3))return;
  this.targetRotation.copy(rotationOverride??this.pose.rotation);
  if(!this.ready){this.position.copy(this.pose.position);this.rotation.copy(this.targetRotation);this.ready=true;}
  this.startP.copy(this.position);this.startQ.copy(this.rotation);
  this.positionTau=recovered?.018:.008+.010*Math.exp(-this.position.distanceTo(this.pose.position)/.04);
  this.rotationTau=recovered?.018:.004+.014*Math.exp(-this.rotation.angleTo(this.targetRotation)/.035);
  this.arrival=arrived;this.sampleTime=data.time;this.lastSeen=arrived;this.frozen=false;this.updates++;
  const label=data.handedness[index]?.[0];this.rawLabel=label?.categoryName??'Unknown';this.rawScore=label?.score??0;
 }
 freeze(arrived:number){this.sample(arrived);if(!this.frozen)this.freezes++;this.frozen=true;this.lastSeen=arrived;}
 sample(now:number){if(!this.ready||this.frozen||now-this.lastSeen>=TRACKING.staleMs)return;const age=Math.max(0,now-this.arrival)/1000;this.position.lerpVectors(this.startP,this.pose.position,1-Math.exp(-age/this.positionTau));this.rotation.slerpQuaternions(this.startQ,this.targetRotation,1-Math.exp(-age/this.rotationTau));}
 snapshot(now:number){return {updates:this.updates,identityFreezes:this.freezes,frozen:this.frozen,source:this.pose.source,reliable:this.pose.reliable,reason:this.pose.reason,directionHolds:this.pose.holds,lastRawLabel:this.rawLabel,lastRawScore:this.rawScore,ageMs:Number.isFinite(this.lastSeen)?Math.max(0,now-this.lastSeen):null,positionError:this.position.distanceTo(this.pose.position),targetRotationGapDeg:this.rotation.angleTo(this.targetRotation)*180/Math.PI,prediction:false};}
}
export class ControlCore{
 private last=-Infinity;
 readonly identity=new ControlIdentity();readonly hands={Left:new ControlHand(),Right:new ControlHand()};
 setLeftLabel(label:RawHand){this.identity.leftLabel=label;this.reset();}
 reset(){this.last=-Infinity;this.identity.reset();for(const side of SIDES)this.hands[side].reset();}
 observe(data:ControlInput,arrived:number,viewAspect:number){if(data.time<=this.last)return null;this.last=data.time;const matches=this.identity.assign(data,arrived);for(const m of matches){const hand=this.hands[m.side];if(m.freeze)hand.freeze(arrived);else hand.push(data,m.index,m.side,arrived,viewAspect,m.fresh);}return matches;}
 sample(now:number){for(const side of SIDES)this.hands[side].sample(now);}
 snapshot(now:number){return {version:'1.6',leftRawLabel:this.identity.leftLabel,mapping:'已校正時：實際左手→藍，實際右手→紅；未校正時沿用原始 Right→藍',identity:this.identity.status,details:[...this.identity.details],Left:this.hands.Left.snapshot(now),Right:this.hands.Right.snapshot(now)};}
}
