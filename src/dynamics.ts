const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export function soundForSpeed(speed:number){
 const s=clamp(Number.isFinite(speed)?speed:0,0,24),energy=1-Math.exp(-s/8);
 return {pitch:62+energy*115,gain:.045+energy*.10,cutoff:260+energy*2900,wind:Math.pow(energy,1.8)*.16};
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
