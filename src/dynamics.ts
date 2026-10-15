const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export function soundForSpeed(speed:number){
 const s=clamp(Number.isFinite(speed)?speed:0,0,24),energy=1-Math.exp(-s/8);
 const moving=1-Math.exp(-Math.max(0,s-.12)/5),blend=clamp((s-3)/11,0,1);
 return {hum:.34,soft:moving*Math.cos(blend*Math.PI/2)*.72,fast:moving*Math.sin(blend*Math.PI/2)*.85,rate:1+energy*.035};
}
export class BladeState {
 extension=0;active=false;lastSeen=-Infinity;requested=false;
 observe(open:boolean,time:number){this.requested=open;this.lastSeen=time;}
 step(now:number,dt:number){
  // Brief occlusions retain state; longer losses retract safely and silence audio.
  this.active=this.requested&&now-this.lastSeen<260;
  const target=this.active?1:0,delta=Math.max(0,Math.min(dt,.1))/(this.active?.16:.12);
  this.extension=target>this.extension?Math.min(target,this.extension+delta):Math.max(target,this.extension-delta);
  return this.extension;
 }
 reset(){this.extension=0;this.active=false;this.requested=false;this.lastSeen=-Infinity;}
}
export function motionSpeed(distance:number,elapsed:number){return elapsed>0&&elapsed<.45?clamp(distance/elapsed,0,24):0;}
