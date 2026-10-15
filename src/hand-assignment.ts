import {reliablePalm,type Point,type Side} from './gesture.ts';
type Track={x:number;y:number;vx:number;vy:number;time:number};
type Detection={landmarks:Point[][];handedness:{categoryName:string;score:number}[][];time:number};
type Candidate={index:number;x:number;y:number;width:number;side:Side;score:number};
/** Raw front-camera pixels are not mirrored; exchange the model's selfie labels once.
 * Then keep temporal ownership independent of list order, image-side and transient labels. */
export class HandAssignment {
 private tracks:Partial<Record<Side,Track>>={};
 private last=-Infinity;
 status='等待手部';
 reset(){this.tracks={};this.last=-Infinity;this.status='等待手部';}
 assign(data:Detection):{side:Side;index:number}[]{
  if(data.time<=this.last)return [];this.last=data.time;
  const candidates:Candidate[]=[];
  for(let index=0;index<Math.min(2,data.landmarks.length);index++){
   const p=data.landmarks[index],label=data.handedness[index]?.[0];
   if(!label||!Number.isFinite(label.score)||label.score<.55||!['Left','Right'].includes(label.categoryName)||!reliablePalm(p))continue;
   candidates.push({index,x:(p[0].x+p[5].x+p[9].x+p[17].x)/4,y:(p[0].y+p[5].y+p[9].y+p[17].y)/4,width:Math.hypot(p[5].x-p[17].x,p[5].y-p[17].y),side:label.categoryName==='Left'?'Right':'Left',score:label.score});
  }
  if(!candidates.length){this.status=data.landmarks.length?'關鍵點或手別信心不足：拒用結果':'MediaPipe 未偵測手部';return [];}
  if(candidates.length===2&&Math.hypot(candidates[0].x-candidates[1].x,candidates[0].y-candidates[1].y)<Math.max(.045,Math.min(candidates[0].width,candidates[1].width)*.45)){
   this.status='重疊／重複辨識：暫留原身分';return [];
  }
  const cost=(side:Side,c:Candidate)=>{
   const t=this.tracks[side],age=t?(data.time-t.time)/1000:Infinity;
   if(!t||age>.8)return c.side===side?.1*(1-c.score):Infinity;
   const horizon=Math.min(.10,Math.max(0,age)),predict=age<.25?1:0;
   const distance=Math.hypot(c.x-t.x-t.vx*horizon*predict,c.y-t.y-t.vy*horizon*predict);
   if(distance>Math.max(.28,age*3.5))return Infinity;
   return distance/Math.max(.08,c.width*2)+(c.side===side?0:.65*c.score);
  };
  let best:{side:Side;index:number}[]=[],bestCost=Infinity;
  // A missing detection is cheaper than assigning an implausible identity jump.
  for(let l=-1;l<candidates.length;l++)for(let r=-1;r<candidates.length;r++){
   if(l>=0&&l===r)continue;
   const total=(l<0?1.7:cost('Left',candidates[l]))+(r<0?1.7:cost('Right',candidates[r]));
   if(total<bestCost){bestCost=total;best=[];if(l>=0)best.push({side:'Left',index:l});if(r>=0)best.push({side:'Right',index:r});}
  }
  this.status=!best.length?'候選與既有身分不相符：拒用結果':best.some(a=>candidates[a.index].side!==a.side)?'依時序維持手部身分':'依手別與時序配對';
  return best.map(a=>{
   const c=candidates[a.index],old=this.tracks[a.side],dt=old?(data.time-old.time)/1000:0;
   const vx=old&&dt>0&&dt<.25?Math.max(-3,Math.min(3,(c.x-old.x)/dt)):0,vy=old&&dt>0&&dt<.25?Math.max(-3,Math.min(3,(c.y-old.y)/dt)):0;
   this.tracks[a.side]={x:c.x,y:c.y,vx,vy,time:data.time};return {side:a.side,index:c.index};
  });
 }
}
