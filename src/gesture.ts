export type Point = {x:number;y:number;z:number};
export type Side = 'Left'|'Right';
export type Pose = {side:Side; points:Point[]; world?:Point[]; open:boolean; gesture?:GestureEvidence; time:number;imageAspect?:number};
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
// Joint angles are rotation invariant; thumb is deliberately optional.
export function extendedFingers(p:Point[]):number {
 if(p.length!==21||p.some(v=>![v.x,v.y,v.z].every(Number.isFinite)))return 0;
 return [5,9,13,17].filter(i=>{
  const a=p[i],b=p[i+1],c=p[i+2],d=p[i+3];
  const ux=a.x-b.x,uy=a.y-b.y,uz=a.z-b.z,vx=c.x-b.x,vy=c.y-b.y,vz=c.z-b.z;
  const cosine=(ux*vx+uy*vy+uz*vz)/(Math.hypot(ux,uy,uz)*Math.hypot(vx,vy,vz)||1);
  return cosine<-.65 && distance(d,p[0])>distance(b,p[0])*1.12;
 }).length;
}

export type GestureKind='OPEN'|'FIST'|'UNKNOWN'|'LOST';
export type GestureEvidence={kind:GestureKind;count:number;confidence:number;reason:string};
// Both hinge angles and chain reach must agree. A failed extension test is not curl evidence.
function evidence(p:Point[]):GestureEvidence{
 const count=extendedFingers(p);
 if(p.length!==21||p.some(v=>![v.x,v.y,v.z].every(Number.isFinite)))return {kind:'UNKNOWN',count,confidence:0,reason:'關鍵點不足或非有限值'};
 const palm=distance(p[0],p[9]);let straight=0,curled=0,valid=0;
 const cosine=(a:Point,b:Point,c:Point)=>((a.x-b.x)*(c.x-b.x)+(a.y-b.y)*(c.y-b.y)+(a.z-b.z)*(c.z-b.z))/(distance(a,b)*distance(c,b));
 for(const i of [5,9,13,17]){
  const a=p[i],b=p[i+1],c=p[i+2],d=p[i+3],ab=distance(a,b),bc=distance(b,c),cd=distance(c,d),length=ab+bc+cd;
  if(palm<1e-6||Math.min(ab,bc,cd)<palm*.06||Math.max(ab,bc,cd)>palm*1.2||length<palm*.4||length>palm*2.5)continue;
  valid++;const pip=cosine(a,b,c),dip=cosine(b,c,d),reach=distance(a,d)/length;
  if(pip<-.72&&dip<-.65&&reach>.82)straight++;
  if(pip>-.35&&dip>-.65&&reach<.68&&distance(d,p[0])<distance(b,p[0])*1.12)curled++;
 }
 const kind=straight>=3?'OPEN':curled>=3?'FIST':'UNKNOWN';
 return {kind,count,confidence:(kind==='OPEN'?straight:kind==='FIST'?curled:0)/4,reason:kind==='OPEN'?'至少三指雙關節伸展一致':kind==='FIST'?'至少三指彎曲且指尖收攏':valid<3?'指節比例不可靠':'伸展與彎曲證據不足或矛盾'};
}
export function classifyGesture(points:Point[],world?:Point[],aspect=4/3):GestureEvidence{
 // Image x/z use width units, y uses height units. Normalize before checking geometry.
 const image=evidence(points.map(p=>({x:p.x,y:p.y/aspect,z:p.z})));
 if(!world||world.length!==21)return image;
 const spatial=evidence(world);
 if(spatial.kind!=='UNKNOWN'&&image.kind!=='UNKNOWN'&&spatial.kind!==image.kind)return {...spatial,kind:'UNKNOWN',confidence:0,reason:'世界與影像座標證據矛盾'};
 return spatial.kind!=='UNKNOWN'?spatial:{...spatial,reason:'三維關鍵點不可靠：'+spatial.reason};
}
