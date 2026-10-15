// Shared hand tracking types. Activation depends on reliable identity, never finger shape.
export type Point={x:number;y:number;z:number};
export type Side='Left'|'Right';
// open remains for archived benchmark fixtures; the live scene deliberately ignores it.
export type Pose={side:Side;points:Point[];world?:Point[];open:boolean;time:number;imageAspect?:number};
export const finitePoint=(p:Point|undefined):p is Point=>!!p&&[p.x,p.y,p.z].every(Number.isFinite);
export function palmCenter(points:Point[]){
 const ids=[0,5,9,17].filter(i=>finitePoint(points[i]));
 return {x:ids.reduce((s,i)=>s+points[i].x,0)/ids.length,y:ids.reduce((s,i)=>s+points[i].y,0)/ids.length};
}
export function completePalm(points:Point[]){return [0,5,9,17].every(i=>finitePoint(points[i]))&&reliablePalm(points);}
export function reliablePalm(points:Point[]):boolean{
 if(!finitePoint(points[0]))return false;
 const mcps=[5,9,13,17].filter(i=>finitePoint(points[i]));if(mcps.length<2)return false;
 return mcps.some(i=>Math.hypot(points[i].x-points[0].x,points[i].y-points[0].y,points[i].z-points[0].z)>1e-5)&&mcps.some(i=>Math.hypot(points[i].x-points[mcps[0]].x,points[i].y-points[mcps[0]].y,points[i].z-points[mcps[0]].z)>1e-5);
}
