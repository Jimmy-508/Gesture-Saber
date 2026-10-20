import {ControlIdentity,type ControlInput,type ControlMatch,type RawHand} from './control-identity.ts';
import {ControlHand} from './control-core.ts';
import {GripPose} from './grip-pose.ts';
import type {Side} from './gesture.ts';
import {TRACKING} from './tracking-state.ts';
import {TwinGesture,joinEvidence} from './twin-gesture.ts';
/** Two observations for identity/commands, exactly one pose/filter for the weapon. */
export class WeaponControl{
 readonly identity=new ControlIdentity();readonly hand=new ControlHand();readonly grip=new GripPose();readonly mode=new TwinGesture();
 primary:Side|null=null;lastSeen=-Infinity;serial=0;private last=-Infinity;private axisEstablished=false;
 reset(){this.identity.reset();this.hand.reset();this.grip.reset();this.mode.reset();this.axisEstablished=false;this.primary=null;this.lastSeen=this.last=-Infinity;this.serial++;}
 // Blade readiness is latched after the first accepted grip direction. Presence
 // and its original timeout are handled separately; fingers cannot retract it.
 get singleOn(){return this.primary!==null&&this.axisEstablished;}
 setLeftLabel(label:RawHand){this.identity.leftLabel=label;this.reset();}
 advance(now:number){if(this.primary&&now-this.lastSeen>=TRACKING.hideMs){this.reset();return true;}return false;}
 observe(data:ControlInput,arrived:number,viewAspect:number,modern=true):{match:ControlMatch|null;fresh:boolean;changed:boolean}|null{
  if(!Number.isFinite(data.time)||data.time<=this.last)return null;this.advance(arrived);this.last=data.time;
  const matches=this.identity.assign(data,arrived);let fresh=false;
  if(!this.primary){const valid=matches.filter(m=>!m.freeze&&m.index>=0).sort((a,b)=>(data.handedness[b.index]?.[0]?.score??0)-(data.handedness[a.index]?.[0]?.score??0)||(a.side==='Left'?-1:1));if(valid.length){this.primary=valid[0].side;fresh=true;this.hand.reset();this.grip.reset();this.mode.reset();this.axisEstablished=false;}}
  const match=matches.find(m=>m.side===this.primary)??null;
  // Presence has its own evidence; it must not manufacture a new pose timestamp.
  if(match?.freeze&&match.present)this.lastSeen=arrived;
  if(match&&!match.freeze){const p=data.landmarks[match.index],world=data.world?.[match.index];this.lastSeen=arrived;
   // One learned shaft frame survives open fingers and every mode/blade change.
   // Neither gesture uncertainty nor a held direction can reject position updates.
   if(this.grip.update(p,world,match.side,data.aspect??4/3))this.axisEstablished=true;
  }
  const evidence=joinEvidence(data,matches,this.identity.leftLabel,!!match&&!match.freeze);
  if(evidence.kind==='JOIN'&&!this.axisEstablished){evidence.kind='UNKNOWN';evidence.reason='等待可信主控握柄軸線';}
  const changed=this.primary?this.mode.update(evidence,arrived):false;
  if(match){if(modern){if(match.freeze)this.hand.freeze(arrived);else this.hand.push(data,match.index,match.side,arrived,viewAspect,fresh,this.grip.rotation);}}
  // No observation: finish the already accepted response, then remain at its
  // endpoint. This is interpolation, never prediction of unseen hand motion.
  else if(modern&&this.primary)this.hand.miss();
  return {match,fresh,changed};
 }
 sample(now:number){this.hand.sample(now);}
 snapshot(now:number){return {version:'1.8.1',primary:this.primary,twin:this.mode.twin,armed:this.mode.armed,changes:this.mode.changes,gesture:this.mode.reason,singleBlade:{requested:this.singleOn},identity:this.identity.status,details:[...this.identity.details],leftRawLabel:this.identity.leftLabel,ageMs:this.primary?Math.max(0,now-this.lastSeen):null,grip:{calibrated:this.grip.calibrated,source:this.grip.source,reason:this.grip.reason},pose:this.hand.snapshot(now)};}
}
