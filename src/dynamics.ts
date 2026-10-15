const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export function soundForSpeed(speed:number){
 const s=clamp(Number.isFinite(speed)?speed:0,0,24),energy=1-Math.exp(-s/8);
 return {pitch:62+energy*115,gain:.045+energy*.10,cutoff:260+energy*2900,wind:Math.pow(energy,1.8)*.16};
}
/** Each hand owns its state; only trusted, assigned observations refresh lastSeen. */
export class BladeState {
 extension=0;active=false;lastSeen=-Infinity;requested=false;lost=true;reason='尚未追蹤';
 // False is reserved for the developer demo's explicit extension/retraction cycle.
 observe(tracked:boolean,time:number){
  if(time<=this.lastSeen)return;
  this.requested=tracked;this.lastSeen=time;this.lost=false;this.reason=tracked?'可靠手部追蹤':'展示收劍';
 }
 markLost(reason:string){this.lost=true;this.reason=reason;}
 visible(now:number){return now-this.lastSeen<420;}
 diagnostics(now:number){const age=Number.isFinite(this.lastSeen)?Math.max(0,now-this.lastSeen):0;return (this.lost?'LOST':'TRACKED')+' · 中斷 '+(this.lost?Math.round(age):0)+' ms · '+(this.active?'啟動':this.extension>0?'收縮':'收起')+' · '+this.reason;}
 step(now:number,dt:number){
  if(!Number.isFinite(this.lastSeen)){this.active=false;return this.extension=0;}
  const age=now-this.lastSeen;
  if(age>=180&&!this.lost)this.markLost('追蹤資料逾時：未收到新結果');
  if(age>=260){this.requested=false;this.reason=age>=420?'持續 LOST：隱藏':'持續 LOST：收劍';}
  this.active=this.requested&&age<260;
  const target=this.active?1:0,delta=Math.max(0,Math.min(dt,.1))/(this.active?.16:.12);
  this.extension=target>this.extension?Math.min(target,this.extension+delta):Math.max(target,this.extension-delta);
  return this.extension;
 }
 reset(){this.extension=0;this.active=false;this.requested=false;this.lastSeen=-Infinity;this.lost=true;this.reason='尚未追蹤';}
}
export function motionSpeed(distance:number,elapsed:number){return elapsed>0&&elapsed<.45?clamp(distance/elapsed,0,24):0;}
