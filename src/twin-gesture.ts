import type {Point} from './gesture.ts';
import type {ControlInput,ControlMatch,RawHand} from './control-identity.ts';
import {observeHand,duplicateHands} from './hand-presence.ts';
import {TRACKING} from './tracking-state.ts';
export type Fist='FIST'|'OPEN'|'UNKNOWN';
export type JoinEvidence={kind:'JOIN'|'RELEASE'|'UNKNOWN';absent:boolean;reason:string};
const FINGERS=[[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]];
const PALM=[0,5,9,13,17];
const finite=(p:Point|undefined):p is Point=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z);
function palm(points:Point[],aspect:number){let n=0,x=0,y=0;for(const i of PALM){const p=points[i];if(p&&Number.isFinite(p.x)&&Number.isFinite(p.y)){n++;x+=p.x;y+=p.y/aspect;}}if(n<4||!finite(points[0]))return null;x/=n;y/=n;let scale=0;for(const i of [5,9,13,17])if(finite(points[i]))scale=Math.max(scale,Math.hypot(points[i].x-points[0].x,(points[i].y-points[0].y)/aspect));if(finite(points[5])&&finite(points[17]))scale=Math.max(scale,Math.hypot(points[5].x-points[17].x,(points[5].y-points[17].y)/aspect));return scale>.012&&scale<.65?{x,y,scale}:null;}
function fingers(points:Point[]|undefined,aspect:number,metric:boolean){
 if(!points||!finite(points[0]))return null;let n=0,cx=0,cy=0,cz=0;for(const i of PALM)if(finite(points[i])){n++;cx+=points[i].x;cy+=points[i].y/aspect;cz+=points[i].z;}if(n<4)return null;cx/=n;cy/=n;cz/=n;
 let scale=0;for(const i of [5,9,13,17])if(finite(points[i]))scale=Math.max(scale,Math.hypot(points[i].x-points[0].x,(points[i].y-points[0].y)/aspect,points[i].z-points[0].z));if(scale<(metric?.015:.012)||scale>(metric?.22:1))return null;
 let bent=0,open=0,valid=0;
 for(const [m,p,d,t] of FINGERS){const a=points[m],b=points[p],c=points[d],e=points[t];if(![a,b,c,e].every(finite))continue;
  const ux=b.x-a.x,uy=(b.y-a.y)/aspect,uz=b.z-a.z,vx=c.x-b.x,vy=(c.y-b.y)/aspect,vz=c.z-b.z,wx=e.x-c.x,wy=(e.y-c.y)/aspect,wz=e.z-c.z;
  const l1=Math.hypot(ux,uy,uz),l2=Math.hypot(vx,vy,vz),l3=Math.hypot(wx,wy,wz);if(Math.min(l1,l2,l3)<scale*.055||Math.max(l1,l2,l3)>scale*1.2)continue;valid++;
  const dot1=(ux*vx+uy*vy+uz*vz)/(l1*l2),dot2=(vx*wx+vy*wy+vz*wz)/(l2*l3),tip=Math.hypot(e.x-cx,e.y/aspect-cy,e.z-cz);
  if((dot1<.55||dot2<.35)&&tip<scale*.9)bent++;else if(dot1>.75&&dot2>.6&&tip>scale*.65)open++;
 }
 return {bent,open,valid,kind:(bent>=3&&open<=1?'FIST':open>=3?'OPEN':'UNKNOWN') as Fist};
}
/** Positive curl evidence, never a low extended-finger count. Missing tips are unknown. */
export function fistEvidence(points:Point[],world:Point[]|undefined,aspect=4/3){
 const image=fingers(points,aspect,false),metric=fingers(world,1,true),chosen=metric&&metric.valid>=3?metric:image;
 if(!chosen||chosen.valid<3)return {kind:'UNKNOWN' as Fist,bent:0,valid:chosen?.valid??0};
 if(metric&&image&&((metric.kind==='FIST'&&image.kind==='OPEN')||(metric.kind==='OPEN'&&image.kind==='FIST')))return {kind:'UNKNOWN' as Fist,bent:chosen.bent,valid:chosen.valid};
 return {kind:chosen.kind,bent:chosen.bent,valid:chosen.valid};
}
export function joinEvidence(data:ControlInput,matches:ControlMatch[],leftLabel:RawHand,primaryTracked:boolean):JoinEvidence{
 const unknown=(reason:string,absent=false):JoinEvidence=>({kind:'UNKNOWN',reason,absent});
 if(data.landmarks.length!==2)return unknown('等待可信雙手',primaryTracked&&data.landmarks.length===1);
 if(duplicateHands(data.landmarks[0],data.landmarks[1]))return unknown('重複同手觀測');
 if(matches.length!==2||matches.some(m=>m.freeze||m.index<0)||new Set(matches.map(m=>m.side)).size!==2)return unknown('雙手身分不明／遮擋');
 for(const m of matches){const label=data.handedness[m.index]?.[0];if(!label||!Number.isFinite(label.score)||label.score<.65||label.categoryName!==(m.side==='Left'?leftLabel:leftLabel==='Left'?'Right':'Left'))return unknown('手別證據矛盾或不足');if(!observeHand(data.landmarks[m.index]))return unknown('手部資料無效');}
 const aspect=typeof data.aspect==='number'&&Number.isFinite(data.aspect)&&data.aspect>0?data.aspect:4/3,a=palm(data.landmarks[0],aspect),b=palm(data.landmarks[1],aspect);if(!a||!b)return unknown('掌部尺度不足');
 if(Math.max(a.scale,b.scale)/Math.min(a.scale,b.scale)>2)return unknown('雙手尺度差異過大');
 const distance=Math.hypot(a.x-b.x,a.y-b.y),ratio=distance/((a.scale+b.scale)/2);if(distance<.6*Math.min(a.scale,b.scale))return unknown('掌部重疊過多');
 const left=fistEvidence(data.landmarks[0],data.world?.[0],aspect),right=fistEvidence(data.landmarks[1],data.world?.[1],aspect);
 if(ratio>2.25||left.kind==='OPEN'||right.kind==='OPEN')return {kind:'RELEASE',absent:false,reason:ratio>2.25?'雙手已分開':'已鬆拳'};
 if(ratio<=1.7&&left.kind==='FIST'&&right.kind==='FIST')return {kind:'JOIN',absent:false,reason:'可信雙拳靠攏'};
 return unknown('等待雙拳靠攏證據');
}
/** A latched command. Unknown observations cannot be mistaken for a release. */
export class TwinGesture{
 twin=false;armed=true;changes=0;lastToggle=-Infinity;reason='等待雙拳靠攏';
 private joined=-Infinity;private released=-Infinity;private absent=-Infinity;private last=-Infinity;private samples=0;
 reset(){this.twin=false;this.armed=true;this.changes=0;this.lastToggle=this.joined=this.released=this.absent=this.last=-Infinity;this.samples=0;this.reason='等待雙拳靠攏';}
 update(e:JoinEvidence,now:number){if(!Number.isFinite(now)||now<=this.last)return false;if(now-this.last>125){this.joined=this.released=this.absent=-Infinity;this.samples=0;}this.last=now;this.reason=e.reason;
  if(e.kind==='JOIN'){this.released=this.absent=-Infinity;if(!Number.isFinite(this.joined))this.joined=now;this.samples++;if(this.armed&&this.samples>=3&&now-this.joined>=180){this.twin=!this.twin;this.armed=false;this.changes++;this.lastToggle=now;return true;}}
  else{this.joined=-Infinity;this.samples=0;if(e.kind==='RELEASE'){this.absent=-Infinity;if(!Number.isFinite(this.released))this.released=now;if(now-this.released>=140)this.armed=true;}else{this.released=-Infinity;if(e.absent){if(!Number.isFinite(this.absent))this.absent=now;if(now-this.absent>=TRACKING.hideMs)this.armed=true;}else this.absent=-Infinity;}}
  return false;
 }
}
