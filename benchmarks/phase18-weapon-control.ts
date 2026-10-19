import {ControlIdentity,type ControlInput,type ControlMatch,type RawHand} from './phase18-control-identity.ts';
import {ControlHand} from './phase18-control-core.ts';
import {GripPose} from '../src/grip-pose.ts';
import type {Side} from '../src/gesture.ts';
import {TRACKING} from '../src/tracking-state.ts';
import {TwinGesture,joinEvidence} from '../src/twin-gesture.ts';
/** Two observations for identity/commands, exactly one pose/filter for the weapon. */
export class WeaponControl{
 readonly identity=new ControlIdentity();readonly hand=new ControlHand();readonly grip=new GripPose();readonly mode=new TwinGesture();
 primary:Side|null=null;lastSeen=-Infinity;serial=0;private last=-Infinity;
 reset(){this.identity.reset();this.hand.reset();this.grip.reset();this.mode.reset();this.primary=null;this.lastSeen=this.last=-Infinity;this.serial++;}
 setLeftLabel(label:RawHand){this.identity.leftLabel=label;this.reset();}
 advance(now:number){if(this.primary&&now-this.lastSeen>=TRACKING.hideMs){this.reset();return true;}return false;}
 observe(data:ControlInput,arrived:number,viewAspect:number,modern=true):{match:ControlMatch|null;fresh:boolean;changed:boolean}|null{
  if(!Number.isFinite(data.time)||data.time<=this.last)return null;this.advance(arrived);this.last=data.time;
  const matches=this.identity.assign(data,arrived);let fresh=false;
  if(!this.primary){const valid=matches.filter(m=>!m.freeze&&m.index>=0).sort((a,b)=>(data.handedness[b.index]?.[0]?.score??0)-(data.handedness[a.index]?.[0]?.score??0)||(a.side==='Left'?-1:1));if(valid.length){this.primary=valid[0].side;fresh=true;this.hand.reset();this.grip.reset();this.mode.reset();}}
  const match=matches.find(m=>m.side===this.primary)??null;
  const changed=this.primary?this.mode.update(joinEvidence(data,matches,this.identity.leftLabel,!!match&&!match.freeze),arrived):false;
  if(changed&&this.mode.twin)this.grip.reset(this.hand.rotation);
  if(match){this.lastSeen=arrived;if(!match.freeze&&this.mode.twin)this.grip.update(data.landmarks[match.index],data.world?.[match.index],match.side,data.aspect??4/3);if(modern){if(match.freeze)this.hand.freeze(arrived);else this.hand.push(data,match.index,match.side,arrived,viewAspect,fresh,this.mode.twin?this.grip.rotation:undefined);}}
  else if(modern&&this.primary)this.hand.freeze(arrived);
  return {match,fresh,changed};
 }
 sample(now:number){this.hand.sample(now);}
 snapshot(now:number){return {version:'1.8',primary:this.primary,twin:this.mode.twin,armed:this.mode.armed,changes:this.mode.changes,gesture:this.mode.reason,identity:this.identity.status,details:[...this.identity.details],leftRawLabel:this.identity.leftLabel,ageMs:this.primary?Math.max(0,now-this.lastSeen):null,grip:{calibrated:this.grip.calibrated,source:this.grip.source,reason:this.grip.reason},pose:this.hand.snapshot(now)};}
}
