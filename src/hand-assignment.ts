import type {Point,Side} from './gesture';
import {observeHand,duplicateHands} from './hand-presence.ts';
import {TRACKING} from './tracking-state.ts';
type Track={x:number;y:number;vx:number;vy:number;time:number};
type Detection={landmarks:Point[][];handedness:{categoryName:string;score:number}[][];time:number};
type Match={side:Side;index:number;freeze?:boolean};
/** Presence -> identity. Pose quality never enters this decision. */
export class HandAssignment{
 private tracks:Partial<Record<Side,Track>>={};private last=-Infinity;
 status='等待手部';details:string[]=[];
 reset(){this.tracks={};this.last=-Infinity;this.status='等待手部';this.details=[];}
 assign(data:Detection):Match[]{
  if(data.time<=this.last)return [];this.last=data.time;
  this.details=['模型回傳 '+data.landmarks.length+' 隻手'];
  const candidates=data.landmarks.slice(0,2).flatMap((points,index)=>{
   const observation=observeHand(points),label=data.handedness[index]?.[0];
   this.details.push('#'+index+' '+(label?.categoryName??'無手別')+' 分數 '+(Number.isFinite(label?.score)?label.score.toFixed(3):'未知')+' · '+(observation?'存在：'+observation.count+' 點':'拒絕存在：少於3個有限影像點、越界或完全塌陷'));
   const side:Side|undefined=label?.categoryName==='Left'?'Right':label?.categoryName==='Right'?'Left':undefined;
   return observation?[{...observation,index,side}]:[];
  });
  if(candidates.length===2&&duplicateHands(data.landmarks[0],data.landmarks[1])){candidates.pop();this.details.push('#1 拒絕存在：重複同一觀測');}
  this.details.push('有效存在 '+candidates.length+' 隻');
  const sides:Side[]=['Left','Right'];
  const history=(s:Side)=>{const t=this.tracks[s];return t&&data.time-t.time<TRACKING.hideMs?t:undefined;};
  const distance=(s:Side,c:typeof candidates[number])=>{const t=history(s);if(!t)return Infinity;const dt=Math.min(.08,(data.time-t.time)/1000);return Math.hypot(c.x-t.x-t.vx*dt,c.y-t.y-t.vy*dt);};
  const cost=(s:Side,c:typeof candidates[number])=>{
   const t=history(s);if(!t)return c.side===s?.05:Infinity;
   const dt=Math.min(.08,(data.time-t.time)/1000);
   return Math.hypot(c.x-t.x-t.vx*dt,c.y-t.y-t.vy*dt)+(c.side&&c.side!==s?.04:0);
  };
  // A single ambiguous observation cannot prove that both historical hands remain.
  if(candidates.length===1&&history('Left')&&history('Right')&&Math.abs(distance('Left',candidates[0])-distance('Right',candidates[0]))<.04){this.status='有手但身分歧義：暫停更新';this.details.push(this.status);return [];}
  if(candidates.length===2&&history('Left')&&history('Right')){
   const direct=distance('Left',candidates[0])+distance('Right',candidates[1]),swapped=distance('Left',candidates[1])+distance('Right',candidates[0]);
   if(Math.abs(direct-swapped)<.025){this.status='雙手存在、身分歧義：保留兩劍並凍結姿態';this.details.push(this.status);for(const s of sides)this.tracks[s]!.time=data.time;return sides.map((side,index)=>({side,index:candidates[index].index,freeze:true}));}
  }
  let best:Match[]=[],value=Infinity;
  for(let l=-1;l<candidates.length;l++)for(let r=-1;r<candidates.length;r++){
   if(l>=0&&l===r)continue;const total=(l<0?2:cost('Left',candidates[l]))+(r<0?2:cost('Right',candidates[r]));
   if(total<value){value=total;best=[];if(l>=0)best.push({side:'Left',index:candidates[l].index});if(r>=0)best.push({side:'Right',index:candidates[r].index});}
  }
  for(const match of best){const c=candidates.find(c=>c.index===match.index)!,old=history(match.side),dt=old?(data.time-old.time)/1000:0;
   this.tracks[match.side]={x:c.x,y:c.y,vx:old&&dt>0?Math.max(-3,Math.min(3,(c.x-old.x)/dt)):0,vy:old&&dt>0?Math.max(-3,Math.min(3,(c.y-old.y)/dt)):0,time:data.time};
   this.details.push('#'+c.index+' 身分 '+match.side+' → 更新光劍');}
  for(const c of candidates)if(!best.some(m=>m.index===c.index))this.details.push('#'+c.index+' 存在但未定身分：無歷史且手別缺失／衝突');
  this.status=best.length?'身分已維持':'未取得可配對身分';return best;
 }
}
