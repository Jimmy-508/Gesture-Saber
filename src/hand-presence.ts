import type {Point} from './gesture';
export type Observation={x:number;y:number;z:number;count:number;reason:string};
/** Presence is spatial evidence, not palm anatomy, depth accuracy or handedness. */
export function observeHand(points:Point[]):Observation|null{
 const valid=points.filter(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<3&&Math.abs(p.y)<3);
 if(valid.length<3)return null;
 const x=valid.reduce((s,p)=>s+p.x,0)/valid.length,y=valid.reduce((s,p)=>s+p.y,0)/valid.length;
 const zs=valid.filter(p=>Number.isFinite(p.z)&&Math.abs(p.z)<3),z=zs.length?zs.reduce((s,p)=>s+p.z,0)/zs.length:0;
 if(!valid.some(p=>Math.hypot(p.x-x,p.y-y,Number.isFinite(p.z)&&Math.abs(p.z)<3?p.z-z:0)>1e-5))return null;
 // Preserve the previous stable palm position when available; otherwise use remaining observations.
 const palm=[0,5,9,17].map(i=>points[i]).filter(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<3&&Math.abs(p.y)<3);
 const center=palm.length>=3?palm:valid;
 return {x:center.reduce((s,p)=>s+p.x,0)/center.length,y:center.reduce((s,p)=>s+p.y,0)/center.length,z,count:valid.length,reason:'有效觀測'};
}
export function duplicateHands(a:Point[],b:Point[]){let n=0,error=0;for(let i=0;i<Math.min(a.length,b.length);i++){const p=a[i],q=b[i];if(p&&q&&[p.x,p.y,q.x,q.y].every(Number.isFinite)){n++;error+=Math.hypot(p.x-q.x,p.y-q.y,Number.isFinite(p.z)&&Number.isFinite(q.z)?p.z-q.z:0);}}return n>=3&&error/n<.003;}
