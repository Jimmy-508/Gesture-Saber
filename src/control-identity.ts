import type {Point,Side} from './gesture.ts';
import {observeHand,duplicateHands} from './hand-presence.ts';
import {TRACKING} from './tracking-state.ts';
export type RawHand='Left'|'Right';
export type ControlInput={landmarks:Point[][];world?:Point[][];handedness:{categoryName:string;score:number}[][];time:number;aspect?:number};
export type ControlMatch={side:Side;index:number;freeze?:boolean;fresh?:boolean};
/** Calibration belongs at the input boundary, including the unchanged rollback core. */
export function legacyInput<T extends ControlInput>(data:T,leftLabel:RawHand):T{return leftLabel==='Right'?data:{...data,handedness:data.handedness.map(labels=>labels.map(label=>({...label,categoryName:label.categoryName==='Left'?'Right':label.categoryName==='Right'?'Left':label.categoryName})))};}
type Candidate={index:number;x:number;y:number;side:Side|undefined;score:number};
type Track={x:number;y:number;vx:number;vy:number;sample:number;seen:number};
const SIDES:Side[]=['Left','Right'];
/** Labels create an identity. Continuity owns it until the shared presence timeout.
 * Never compete a live single hand against an empty slot's cheap label cost. */
export class ControlIdentity{
 leftLabel:RawHand='Right';status='等待手部';details:string[]=[];
 private tracks:Partial<Record<Side,Track>>={};private last=-Infinity;
 reset(){this.tracks={};this.last=-Infinity;this.status='等待手部';this.details=[];}
 assign(data:ControlInput,arrived:number):ControlMatch[]{
  if(data.time<=this.last)return [];this.last=data.time;
  this.details=['模型回傳 '+data.landmarks.length+' 隻手'];
  const candidates:Candidate[]=[];
  for(let i=0;i<Math.min(2,data.landmarks.length);i++){
   const p=observeHand(data.landmarks[i]),label=data.handedness[i]?.[0];
   this.details.push('#'+i+' '+(label?.categoryName??'無手別')+'／'+(Number.isFinite(label?.score)?label.score.toFixed(3):'未知')+' · '+(p?'有效觀測':'無效／塌陷觀測'));
   if(p)candidates.push({index:i,x:p.x,y:p.y,side:label?.categoryName==='Left'||label?.categoryName==='Right'?(label.categoryName===this.leftLabel?'Left':'Right'):undefined,score:Number.isFinite(label?.score)?Math.max(0,Math.min(1,label.score)):0});
  }
  if(candidates.length===2&&duplicateHands(data.landmarks[candidates[0].index],data.landmarks[candidates[1].index])){candidates.pop();this.details.push('重複觀測只保留一份');}
  const live=SIDES.filter(s=>{const t=this.tracks[s];return t&&arrived-t.seen<TRACKING.hideMs;});
  const distance=(s:Side,c:Candidate)=>{const t=this.tracks[s]!;const dt=Math.min(.12,Math.max(0,(data.time-t.sample)/1000));return Math.hypot(c.x-t.x-t.vx*dt,c.y-t.y-t.vy*dt);};
  const matches:ControlMatch[]=[];
  const take=(side:Side,c:Candidate)=>matches.push({side,index:c.index,fresh:!live.includes(side)});
  if(candidates.length===1){
   const c=candidates[0];
   if(live.length===1){const side=live[0],t=this.tracks[side]!;
    // A stale velocity estimate can point away from a real fast reversal. For
    // this unopposed identity, continuity with the actual last observation is
    // valid evidence when corroborated by the calibrated model label. Keep the
    // same displacement bound and all two-hand
    // ambiguity rules; never use this to choose between two possible owners.
    if(distance(side,c)<.55||(c.side===side&&c.score>=.5&&Math.hypot(c.x-t.x,c.y-t.y)<.55))take(side,c);else this.details.push('單手位移不連續：不建立另一個顏色');}
   else if(live.length===2){const l=distance('Left',c),r=distance('Right',c);if(Math.abs(l-r)>.04&&Math.min(l,r)<.55)take(l<r?'Left':'Right',c);else this.details.push('單份觀測身分歧義：不假設雙手存在');}
   else if(c.side&&c.score>=.5)take(c.side,c);
  }else if(candidates.length===2){
   const [a,b]=candidates;
   if(live.length===2){
    const direct=distance('Left',a)+distance('Right',b),swapped=distance('Left',b)+distance('Right',a);
    if(Math.abs(direct-swapped)<.025){for(const side of SIDES){this.tracks[side]!.seen=arrived;matches.push({side,index:-1,freeze:true});}this.details.push('雙手交叉歧義：保留身分，暫停姿態');}
    else{take('Left',direct<swapped?a:b);take('Right',direct<swapped?b:a);}
   }else if(live.length===1){
    const side=live[0],da=distance(side,a),db=distance(side,b);
    if(Math.abs(da-db)>.04&&Math.min(da,db)<.55){take(side,da<db?a:b);take(side==='Left'?'Right':'Left',da<db?b:a);}
    else{this.tracks[side]!.seen=arrived;matches.push({side,index:-1,freeze:true});this.details.push('第二隻手重疊：保留既有身分，等待分離');}
   }else if(a.side&&b.side&&a.side!==b.side&&a.score>=.5&&b.score>=.5){take(a.side,a);take(b.side,b);}
   else{const best=a.score>=b.score?a:b;if(best.side&&best.score>=.5)take(best.side,best);this.details.push('初次手別衝突：不以畫面位置猜測');}
  }
  for(const m of matches){if(m.freeze)continue;const c=candidates.find(c=>c.index===m.index)!,old=m.fresh?undefined:this.tracks[m.side],dt=old?(data.time-old.sample)/1000:0;
   this.tracks[m.side]={x:c.x,y:c.y,vx:old&&dt>0?Math.max(-3,Math.min(3,(c.x-old.x)/dt)):0,vy:old&&dt>0?Math.max(-3,Math.min(3,(c.y-old.y)/dt)):0,sample:data.time,seen:arrived};this.details.push('#'+m.index+' → '+m.side+'（'+(m.fresh?'建立':'連續身分')+'）');
  }
  this.status=matches.some(m=>m.freeze)?'身分歧義保護':matches.length?'身分已鎖定':'無可確定身分';return matches;
 }
}
