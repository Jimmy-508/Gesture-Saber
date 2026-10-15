// Shared hand tracking types. Activation depends on reliable identity, never finger shape.
export type Point={x:number;y:number;z:number};
export type Side='Left'|'Right';
// open remains for archived benchmark fixtures; the live scene deliberately ignores it.
export type Pose={side:Side;points:Point[];world?:Point[];open:boolean;time:number;imageAspect?:number};
export function reliablePalm(points:Point[]):boolean{
 if(![0,5,9,17].every(i=>points[i]&&[points[i].x,points[i].y,points[i].z].every(Number.isFinite)))return false;
 // Reject collapsed palm data in 3D; an edge-on projected palm remains valid.
 const a=points[0],b=points[9],l=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
 const c=points[5],d=points[17],w=Math.hypot(c.x-d.x,c.y-d.y,c.z-d.z);
 return l>1e-5&&w>1e-5;
}
