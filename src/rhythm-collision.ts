import {Vector3,Line3,Triangle} from 'three';
export type BladeSegment={a:Vector3;b:Vector3;active:boolean};
/** Capsule / sphere and bounded swept surface, using reusable scratch objects. */
export class BladeCollider{
 private line=new Line3();private triangle=new Triangle();readonly contact=new Vector3();private scratch=new Vector3();
 touches(center:Vector3,radius:number,blade:BladeSegment,previous:BladeSegment|undefined,sweep:boolean){
  if(!blade.active)return false;const rr=(radius+.055)**2;
  this.line.set(blade.a,blade.b).closestPointToPoint(center,true,this.contact);if(this.contact.distanceToSquared(center)<=rr)return true;
  if(!sweep||!previous?.active||Math.max(blade.a.distanceTo(previous.a),blade.b.distanceTo(previous.b))>1.5)return false;
  this.triangle.set(previous.a,previous.b,blade.b).closestPointToPoint(center,this.contact);if(this.contact.distanceToSquared(center)<=rr)return true;
  this.triangle.set(previous.a,blade.b,blade.a).closestPointToPoint(center,this.scratch);if(this.scratch.distanceToSquared(center)<=rr){this.contact.copy(this.scratch);return true;}return false;
 }
}
