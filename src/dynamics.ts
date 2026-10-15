import type {GestureEvidence,GestureKind} from './gesture';
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export function soundForSpeed(speed:number){
 const s=clamp(Number.isFinite(speed)?speed:0,0,24),energy=1-Math.exp(-s/8);
 return {pitch:62+energy*115,gain:.045+energy*.10,cutoff:260+energy*2900,wind:Math.pow(energy,1.8)*.16};
}
export class BladeState {
 extension=0;active=false;lastSeen=-Infinity;requested=false;
 gesture:GestureKind='LOST';lastReliable:GestureKind='UNKNOWN';lastReliableTime=-Infinity;reason='尚未追蹤';evidence:GestureEvidence={kind:'LOST',count:0,confidence:0,reason:'尚未追蹤'};
 private candidate:GestureKind='UNKNOWN';private since=0;
 observe(open:boolean,time:number){this.requested=open;this.lastSeen=time;this.gesture=open?'OPEN':'FIST';this.lastReliable=this.gesture;this.lastReliableTime=time;}
 observeGesture(value:GestureEvidence,time:number){
  this.evidence=value;this.gesture=value.kind;
  if(value.kind==='LOST'){this.candidate='UNKNOWN';this.reason=value.reason;return;}
  this.lastSeen=time;
  if(value.kind==='UNKNOWN'){this.candidate='UNKNOWN';this.reason=value.reason;return;}
  this.lastReliable=value.kind;this.lastReliableTime=time;
  if(this.candidate!==value.kind){this.candidate=value.kind;this.since=time;}
  if(time-this.since>=(value.kind==='OPEN'?110:80))this.requested=value.kind==='OPEN';
  this.reason=value.kind==='FIST'?'可靠握拳收劍':'可靠張掌';
 }
 get lost(){return this.gesture==='LOST';}
 visible(now:number){return now-this.lastSeen<420;}
 diagnostics(now:number){const lost=Number.isFinite(this.lastSeen)?Math.max(0,now-this.lastSeen):0;return '手指 '+this.evidence.count+' · '+(lost>180?'LOST':this.gesture)+' · 可靠度 '+this.evidence.confidence.toFixed(2)+' · '+this.evidence.reason+' · 最近可靠 '+this.lastReliable+' · 中斷 '+(this.lost||lost>180?Math.round(lost):0)+' ms · '+(this.active?'啟動':this.extension>0?'收縮':'收起')+' · '+this.reason;}
 step(now:number,dt:number){
  // Brief occlusions retain state; longer losses retract safely and silence audio.
  if(now-this.lastSeen>=180&&this.gesture!=='LOST'){this.observeGesture({kind:'LOST',count:this.evidence.count,confidence:0,reason:'追蹤資料逾時：未收到新結果'},now);}
  const missing=now-this.lastSeen>=260,uncertain=this.gesture==='UNKNOWN'&&now-this.lastReliableTime>=700;
  if(missing||uncertain){this.requested=false;this.candidate='UNKNOWN';}
  this.active=this.requested&&!missing&&!uncertain;
  if(missing)this.reason=now-this.lastSeen>=420?'持續 LOST：隱藏':'持續 LOST：收劍';
  else if(uncertain)this.reason='UNKNOWN 持續 700 ms：安全收劍';
  const target=this.active?1:0,delta=Math.max(0,Math.min(dt,.1))/(this.active?.16:.12);
  this.extension=target>this.extension?Math.min(target,this.extension+delta):Math.max(target,this.extension-delta);
  return this.extension;
 }
 reset(){this.extension=0;this.active=false;this.requested=false;this.lastSeen=-Infinity;this.gesture='LOST';this.lastReliable='UNKNOWN';this.lastReliableTime=-Infinity;this.candidate='UNKNOWN';this.reason='尚未追蹤';this.evidence={kind:'LOST',count:0,confidence:0,reason:'尚未追蹤'};}
}
export function motionSpeed(distance:number,elapsed:number){return elapsed>0&&elapsed<.45?clamp(distance/elapsed,0,24):0;}
