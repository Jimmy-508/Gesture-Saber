import {reliablePalm,completePalm,palmCenter,type Point,type Side} from './phase141-gesture.ts';
type Track={x:number;y:number;vx:number;vy:number;strong:number;time:number};
type Detection={landmarks:Point[][];handedness:{categoryName:string;score:number}[][];time:number};
type Candidate={index:number;x:number;y:number;width:number;side:Side;score:number;complete:boolean};
/** Raw front-camera pixels are not mirrored; exchange the model's selfie labels once.
 * Then keep temporal ownership independent of list order, image-side and transient labels. */
export class HandAssignment {
 private tracks:Partial<Record<Side,Track>>={};
 private last=-Infinity;
 status='等待手部';
 details:string[]=[];
 reset(){this.tracks={};this.last=-Infinity;this.status='等待手部';}
 assign(data:Detection):{side:Side;index:number}[]{
  if(data.time<=this.last)return [];this.last=data.time;
  this.details=['模型回傳 '+data.landmarks.length+' 隻手'];
  const candidates:Candidate[]=[];
  for(let index=0;index<Math.min(2,data.landmarks.length);index++){
   const p=data.landmarks[index],label=data.handedness[index]?.[0];
   const score=label?.score,complete=completePalm(p),valid=reliablePalm(p);
   this.details.push('#'+index+' '+(label?.categoryName??'無標籤')+' 分數 '+(Number.isFinite(score)?score.toFixed(3):'無效')+' · 掌部 '+(complete?'完整':valid?'部分可用':'拒用：手腕或有效 MCP 不足／退化'));
   if(!label||!Number.isFinite(score)||!['Left','Right'].includes(label.categoryName)||!valid)continue;
   const center=palmCenter(p),width=complete?Math.hypot(p[5].x-p[17].x,p[5].y-p[17].y):Math.max(.02,...[5,9,13,17].filter(i=>p[i]&&Number.isFinite(p[i].x)&&Number.isFinite(p[i].y)).map(i=>Math.hypot(p[i].x-p[0].x,p[i].y-p[0].y)));
   candidates.push({index,...center,width,side:label.categoryName==='Left'?'Right':'Left',score,complete});
  }
  if(!candidates.length){this.status=data.landmarks.length?'關鍵點或手別信心不足：拒用結果':'MediaPipe 未偵測手部';return [];}
  if(candidates.length===2&&Math.hypot(candidates[0].x-candidates[1].x,candidates[0].y-candidates[1].y)<Math.max(.045,Math.min(candidates[0].width,candidates[1].width)*.45)){
   this.status='重疊／重複辨識：拒用，暫留原身分';this.details.push(this.status);return [];
  }
  const rejected=new Map<string,string>();const reject=(side:Side,c:Candidate,why:string)=>{rejected.set(side+c.index,why);return Infinity;};
  const cost=(side:Side,c:Candidate)=>{
   const t=this.tracks[side],age=t?(data.time-t.time)/1000:Infinity;
   if(!t||age>.8)return c.complete&&c.score>=.55&&c.side===side?.1*(1-c.score):reject(side,c,'新身分需要完整掌部、分數≥0.55及一致手別');
   const horizon=Math.min(.10,Math.max(0,age)),predict=age<.25?1:0;
   const distance=Math.hypot(c.x-t.x-t.vx*horizon*predict,c.y-t.y-t.vy*horizon*predict);
   if(c.score<.55||!c.complete){
    // Weak evidence cannot establish or indefinitely renew ownership. Ambiguous crossings are rejected.
    if(data.time-t.strong>200||age>.2)return reject(side,c,'弱證據已超過200ms歷史期限');
    if(distance>.10)return reject(side,c,'弱證據位置距離超過0.10');
    const other=this.tracks[side==='Left'?'Right':'Left'];
    if(other&&data.time-other.time<250&&Math.hypot(c.x-other.x,c.y-other.y)<distance+.06)return reject(side,c,'與另一手歷史位置歧義');
   }
   if(distance>Math.max(.28,age*3.5))return reject(side,c,'位置跳躍超出身分範圍');
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
  for(const c of candidates){const match=best.find(a=>a.index===candidates.indexOf(c));this.details.push('#'+c.index+' '+(match?'配對 '+match.side+(c.score<.55||!c.complete?'：短期位置連續性':''):'拒用：'+(rejected.get('Left'+c.index)??'左手配對成本較高')+'；'+(rejected.get('Right'+c.index)??'右手配對成本較高')));}
  return best.map(a=>{
   const c=candidates[a.index],old=this.tracks[a.side],dt=old?(data.time-old.time)/1000:0;
   const vx=old&&dt>0&&dt<.25?Math.max(-3,Math.min(3,(c.x-old.x)/dt)):0,vy=old&&dt>0&&dt<.25?Math.max(-3,Math.min(3,(c.y-old.y)/dt)):0;
   this.tracks[a.side]={x:c.x,y:c.y,vx,vy,strong:c.complete&&c.score>=.55&&c.side===a.side?data.time:old?.strong??-Infinity,time:data.time};return {side:a.side,index:c.index};
  });
 }
}
