export type Point = {x:number;y:number;z:number};
export type Side = 'Left'|'Right';
export type Pose = {side:Side; points:Point[]; world?:Point[]; open:boolean; time:number};
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
// Joint angles are rotation invariant; thumb is deliberately optional.
export function extendedFingers(p:Point[]):number {
 return [5,9,13,17].filter(i=>{
  const a=p[i],b=p[i+1],c=p[i+2],d=p[i+3];
  const ux=a.x-b.x,uy=a.y-b.y,uz=a.z-b.z,vx=c.x-b.x,vy=c.y-b.y,vz=c.z-b.z;
  const cosine=(ux*vx+uy*vy+uz*vz)/(Math.hypot(ux,uy,uz)*Math.hypot(vx,vy,vz)||1);
  return cosine<-.65 && distance(d,p[0])>distance(b,p[0])*1.12;
 }).length;
}
export class GestureGate {
 active=false; candidate=false; since=0; last=0;
 update(count:number,time:number){
  if(time-this.last>300){this.active=false;this.since=time;this.candidate=false;}
  this.last=time;
  const next=count>=3?true:count<=1?false:this.active;
  if(next!==this.candidate){this.candidate=next;this.since=time;}
  if(time-this.since>=(next?110:80))this.active=next;
  return this.active;
 }
}
