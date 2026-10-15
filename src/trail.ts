import {Vector3} from 'three';
export const TRAIL_SAMPLES=40;
const OFFSETS=[0,1,3,0,3,2];
/** One identical, color-independent generator per hand. Ring samples never shift/copy history. */
export class TrailBuffer {
 readonly positions=new Float32Array((TRAIL_SAMPLES-1)*12*3);
 readonly ages=new Float32Array((TRAIL_SAMPLES-1)*12);
 readonly uvs=new Float32Array((TRAIL_SAMPLES-1)*12*2);
 private history=new Float32Array(TRAIL_SAMPLES*6);private stamps=new Float64Array(TRAIL_SAMPLES);private strength=new Float32Array(TRAIL_SAMPLES);
 private head=0;private count=0;private lastTime=-Infinity;private cameraRight=new Vector3(1,0,0);
 vertices=0;energy=0;
 constructor(){for(let i=0;i<TRAIL_SAMPLES-1;i++)for(let band=0;band<2;band++)this.uvs.set([0,0,0,1,1,1,0,0,1,1,1,0],(i*2+band)*12);}
 reset(){this.count=this.vertices=0;this.energy=0;this.lastTime=-Infinity;}
 update(base:Vector3,tip:Vector3,now:number,extension:number,maxAge:number,right:Vector3){
  this.cameraRight.copy(right);
  const o=this.head*6,h=this.history,elapsed=(now-this.lastTime)/1000;
  const distance=this.count?Math.hypot(tip.x-h[o+3],tip.y-h[o+4],tip.z-h[o+5]):0;
  const baseDistance=this.count?Math.hypot(base.x-h[o],base.y-h[o+1],base.z-h[o+2]):0;
  if(distance>1.8||baseDistance>1.8||elapsed>.3){this.count=0;}
  // Continuous displacement-to-energy curve, not a fixed hand-speed admission threshold.
  if(extension>.8&&(!this.count||Math.max(distance,baseDistance)>.004)){
   const speed=this.count?Math.max(distance,baseDistance)/Math.max(.004,elapsed):0;
   this.energy=1-Math.exp(-speed/3.2);
   const next=this.count?(this.head+1)%TRAIL_SAMPLES:0;this.head=next;const n=next*6;
   h[n]=base.x;h[n+1]=base.y;h[n+2]=base.z;h[n+3]=tip.x;h[n+4]=tip.y;h[n+5]=tip.z;
   this.stamps[next]=now;this.strength[next]=this.energy;this.lastTime=now;this.count=Math.min(this.count+1,TRAIL_SAMPLES);
  }
  let segments=0;
  for(let i=0;i<this.count-1;i++){
   const a=(this.head-i+TRAIL_SAMPLES)%TRAIL_SAMPLES,b=(a-1+TRAIL_SAMPLES)%TRAIL_SAMPLES;
   if((now-this.stamps[b])/1000>maxAge)break;
   const dx=h[a*6+3]-h[b*6+3],dy=h[a*6+4]-h[b*6+4],projected=Math.hypot(dx,dy);
   const wx=projected>.0001?-dy/projected:right.x,wy=projected>.0001?dx/projected:right.y,wz=projected>.0001?0:right.z;
   for(let band=0;band<2;band++)for(let j=0;j<6;j++){
    const corner=OFFSETS[j],sample=corner<2?a:b,isTip=corner%2===1,src=sample*6+(isTip?3:0),vertex=(segments*2+band)*6+j,offset=vertex*3;
    const fade=Math.max(0,1-(now-this.stamps[sample])/1000/maxAge);
    if(band===0){this.positions[offset]=h[src];this.positions[offset+1]=h[src+1];this.positions[offset+2]=h[src+2];}
    else{const t=sample*6+3,width=(isTip?1:-1)*(.025+.02*this.strength[sample]);this.positions[offset]=h[t]+wx*width;this.positions[offset+1]=h[t+1]+wy*width;this.positions[offset+2]=h[t+2]+wz*width;}
    this.ages[vertex]=fade*fade*this.strength[sample]*(band?1.7:1);
   }
   segments++;
  }
  this.vertices=segments*12;
  if(this.count&&(now-this.lastTime)/1000>maxAge){this.count=0;this.vertices=0;this.energy=0;}
 }
}
