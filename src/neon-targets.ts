import {Group,InstancedMesh,BufferGeometry,Float32BufferAttribute,ShaderMaterial,MeshBasicMaterial,AdditiveBlending,PlaneGeometry,BoxGeometry,IcosahedronGeometry,Matrix4,Quaternion,Vector3,Color,DynamicDrawUsage} from 'three';
import type {BladeSegment} from './rhythm-collision.ts';
export const TARGET_SLOTS=12,CUT_SLOTS=12,SPARKS=96,CUT_LIFE=.62;
export const NEON_COLORS=[0x29e7ff,0xb47aff,0xff429e,0xffbc40];
const Z=new Vector3(0,0,1),Y=new Vector3(0,1,0),FLIP=new Quaternion().setFromAxisAngle(Z,Math.PI);
const vertex=`varying vec3 p;varying vec3 tint;varying float cutFace;attribute float cut;
void main(){p=position;tint=instanceColor;cutFace=cut;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`;
const panel=`varying vec3 p;varying vec3 tint;varying float cutFace;
void main(){vec2 a=abs(p.xy);float border=min(.36955-max(a.x,a.y),(.52263-a.x-a.y)*.7071);
float rim=1.-smoothstep(.005,.027,border);float core=1.-smoothstep(.025,.18,a.x+a.y);
float circuit=(1.-smoothstep(.003,.009,abs(a.x-a.y-.07)))*step(.12,a.x+a.y);
float inner=1.-smoothstep(.003,.009,abs(border-.075));float vents=step(.84,fract(p.y*22.))*step(.19,a.x)*(1.-step(.28,a.x))*(1.-step(.13,a.y));
float bands=step(.88,fract((p.y+p.z)*23.));float front=step(.13,abs(p.z));
vec3 energy=tint*(.23+rim*1.5+front*(circuit*.8+inner*.5+vents*.6))+mix(tint,vec3(1.),.78)*core*.85*front;
energy=mix(energy,mix(tint,vec3(1.),.7)*(1.3+bands*.4),cutFace);
gl_FragColor=vec4(energy,.94*max(max(tint.r,tint.g),tint.b));}`;
const glow=`varying vec3 p;varying vec3 tint;varying float cutFace;
void main(){float r=length(p.xy)*2.;float ring=exp(-abs(r-.62)*22.)*.5;float light=pow(max(0.,1.-r),3.)*.4;gl_FragColor=vec4(tint,ring+light);}`;
type Point=[number,number];
/** Shared closed, thick octagon; the half is clipped once at initialization. */
export function targetGeometry(half=false){
 let polygon:Point[]=Array.from({length:8},(_,i)=>[Math.cos(Math.PI/8+i*Math.PI/4)*.4,Math.sin(Math.PI/8+i*Math.PI/4)*.4]);
 if(half){const clipped:Point[]=[];for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length];if(a[0]>=0)clipped.push(a);if((a[0]>=0)!==(b[0]>=0)){const t=-a[0]/(b[0]-a[0]);clipped.push([0,a[1]+(b[1]-a[1])*t]);}}polygon=clipped;}
 const positions:number[]=[],cuts:number[]=[];const cx=polygon.reduce((sum,p)=>sum+p[0],0)/polygon.length,cy=polygon.reduce((sum,p)=>sum+p[1],0)/polygon.length;
 function triangle(a:number[],b:number[],c:number[],cut=0){positions.push(...a,...b,...c);cuts.push(cut,cut,cut);}
 for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length];triangle([cx,cy,.14],[...a,.14],[...b,.14]);triangle([cx,cy,-.14],[...b,-.14],[...a,-.14]);const cut=half&&Math.abs(a[0])+Math.abs(b[0])<1e-6?1:0;triangle([...a,.14],[...a,-.14],[...b,-.14],cut);triangle([...a,.14],[...b,-.14],[...b,.14],cut);}
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));g.setAttribute('cut',new Float32BufferAttribute(cuts,1));g.computeVertexNormals();g.computeBoundingSphere();return g;
}
function flatGeometry(g:BufferGeometry){g.setAttribute('cut',new Float32BufferAttribute(new Float32Array(g.getAttribute('position').count),1));return g;}
/** One bounded pool for targets, complete split halves, slit flashes and sparks.
 * Every animation uses song time, so pausing does not consume effect lifetimes. */
export class NeonTargets{
 readonly body:InstancedMesh;readonly cores:InstancedMesh;readonly halos:InstancedMesh;readonly tails:InstancedMesh;readonly halves:InstancedMesh;readonly flashes:InstancedMesh;readonly sparks:InstancedMesh;
 readonly meshes:InstancedMesh[];private targetMeshes:InstancedMesh[];private palette=new Int8Array(TARGET_SLOTS).fill(-1);cutsCreated=0;liveCuts=0;liveSparks=0;
 // center xyz, birth, cut angle, visual scale, stroke xy, active, palette
 private cuts=new Float64Array(CUT_SLOTS*10);private particles=new Float64Array(SPARKS*8);private nextCut=0;private nextSpark=0;
 private matrix=new Matrix4();private pos=new Vector3();private size=new Vector3();private q=new Quaternion();private roll=new Quaternion();private tint=new Color();private white=new Color(0xffffff);
 private stroke=new Vector3();private direction=new Vector3();private motion=new Vector3();readonly cutNormal=new Vector3();
 constructor(root:Group){
  const panelMaterial=new ShaderMaterial({vertexShader:vertex,fragmentShader:panel,transparent:true,depthWrite:false,fog:false,toneMapped:false});
  const glowMaterial=new ShaderMaterial({vertexShader:vertex,fragmentShader:glow,transparent:true,depthWrite:false,blending:AdditiveBlending,fog:false,toneMapped:false});
  this.body=new InstancedMesh(targetGeometry(),panelMaterial,TARGET_SLOTS);this.body.name='neon-target-panels';
  this.cores=new InstancedMesh(new IcosahedronGeometry(.105,0),new MeshBasicMaterial({color:0xffffff,toneMapped:false}),TARGET_SLOTS);
  this.halos=new InstancedMesh(flatGeometry(new PlaneGeometry(1,1)),glowMaterial,TARGET_SLOTS);
  this.tails=new InstancedMesh(new BoxGeometry(.035,.035,1.3),new MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.45,blending:AdditiveBlending,depthWrite:false,toneMapped:false}),TARGET_SLOTS);
  this.halves=new InstancedMesh(targetGeometry(true),panelMaterial,CUT_SLOTS*2);this.halves.name='split-target-halves';
  this.flashes=new InstancedMesh(flatGeometry(new PlaneGeometry(1,1)),glowMaterial,CUT_SLOTS);this.flashes.name='slash-energy';
  this.sparks=new InstancedMesh(new BoxGeometry(.022,.11,.022),new MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.9,blending:AdditiveBlending,depthWrite:false,toneMapped:false}),SPARKS);
  this.meshes=[this.body,this.cores,this.halos,this.tails,this.halves,this.flashes,this.sparks];
  this.targetMeshes=[this.body,this.cores,this.halos,this.tails];
  for(const mesh of this.meshes){mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(DynamicDrawUsage);for(let i=0;i<mesh.count;i++)mesh.setColorAt(i,this.tint.setHex(NEON_COLORS[i%4]));root.add(mesh);}
  this.reset();
 }
 target(slot:number,point:Vector3,scale:number,angle:number,id:number){
  if(this.palette[slot]!==id%4){this.palette[slot]=id%4;this.tint.setHex(NEON_COLORS[id%4]);for(const mesh of this.targetMeshes){mesh.setColorAt(slot,mesh===this.cores?this.tint.clone().lerp(this.white,.8):this.tint);mesh.instanceColor!.needsUpdate=true;}}
  this.pos.copy(point);this.q.setFromAxisAngle(Z,angle);this.size.setScalar(scale);this.matrix.compose(this.pos,this.q,this.size);this.body.setMatrixAt(slot,this.matrix);
  this.pos.z+=.17*scale;this.matrix.compose(this.pos,this.q,this.size);this.cores.setMatrixAt(slot,this.matrix);
  this.pos.copy(point);this.pos.z-=.16;this.size.set(scale*1.45,scale*1.45,1);this.q.identity();this.matrix.compose(this.pos,this.q,this.size);this.halos.setMatrixAt(slot,this.matrix);
  this.pos.z-=.75;this.size.setScalar(scale);this.matrix.compose(this.pos,this.q,this.size);this.tails.setMatrixAt(slot,this.matrix);
 }
 hide(slot:number){this.zero();for(const mesh of this.targetMeshes)mesh.setMatrixAt(slot,this.matrix);}
 /** Quantize the projected blade/motion plane to the nearest octagon symmetry.
  * Thus both closed halves retain the original silhouette (maximum 22.5° error). */
 split(time:number,center:Vector3,id:number,scale:number,angle:number,blade:BladeSegment,previous:BladeSegment,continuous:boolean,sparkCount=8){
  this.direction.subVectors(blade.b,blade.a).normalize();this.motion.set(0,0,0);
  if(continuous&&previous.active)this.motion.copy(blade.a).add(blade.b).sub(previous.a).sub(previous.b).multiplyScalar(.5);
  this.stroke.copy(this.motion);this.stroke.z=0;
  if(this.stroke.lengthSq()>.0001){const speed=this.stroke.length();this.stroke.addScaledVector(this.direction,(this.direction.dot(this.stroke)<0?-1:1)*speed*.25);}else this.stroke.copy(this.direction);
  if(Math.hypot(this.stroke.x,this.stroke.y)<.01)this.stroke.set(0,1,0);this.stroke.z=0;this.stroke.normalize();
  const normalAngle=Math.atan2(-this.stroke.x,this.stroke.y),cutAngle=angle+Math.round((normalAngle-angle)/(Math.PI/4))*Math.PI/4;
  this.cutNormal.set(Math.cos(cutAngle),Math.sin(cutAngle),0);
  const k=(this.nextCut++%CUT_SLOTS)*10;this.cuts.set([center.x,center.y,center.z,time,cutAngle,scale,this.stroke.x,this.stroke.y,1,id%4],k);this.cutsCreated++;
  for(let i=0;i<sparkCount;i++){const p=(this.nextSpark++%SPARKS)*8,theta=i*Math.PI*2/sparkCount;this.particles.set([center.x,center.y,center.z,Math.cos(theta)*2+this.stroke.x*.8,Math.sin(theta)*2+this.stroke.y*.8,Math.sin(i*4.7)*1.6,time,1],p);this.sparks.setColorAt(p/8,this.tint.setHex(NEON_COLORS[id%4]));}
  this.sparks.instanceColor!.needsUpdate=true;
 }
 update(time:number,low=false){this.liveCuts=this.liveSparks=0;this.halos.visible=!low;
  for(let i=0;i<CUT_SLOTS;i++){const k=i*10,age=time-this.cuts[k+3],alive=!!this.cuts[k+8]&&age>=0&&age<CUT_LIFE;
   if(!alive){this.cuts[k+8]=0;this.zero();this.halves.setMatrixAt(i*2,this.matrix);this.halves.setMatrixAt(i*2+1,this.matrix);this.flashes.setMatrixAt(i,this.matrix);continue;}
   this.liveCuts++;const a=this.cuts[k+4],s=this.cuts[k+5],fade=Math.min(1,(CUT_LIFE-age)/.2),separation=(.018+age*1.8)*s;
   for(let side=0;side<2;side++){const sign=side===0?1:-1;this.pos.set(this.cuts[k]+Math.cos(a)*separation*sign+this.cuts[k+6]*age*.35,this.cuts[k+1]+Math.sin(a)*separation*sign+this.cuts[k+7]*age*.35-age*age*.8,this.cuts[k+2]+age*.5);
    this.q.setFromAxisAngle(Z,a+sign*age*.8);this.roll.setFromAxisAngle(Y,sign*age*2.2);this.q.multiply(this.roll);if(side===1)this.q.multiply(FLIP);this.size.setScalar(s*(.8+.2*fade));this.matrix.compose(this.pos,this.q,this.size);this.halves.setMatrixAt(i*2+side,this.matrix);this.halves.setColorAt(i*2+side,this.tint.setHex(NEON_COLORS[this.cuts[k+9]]).multiplyScalar(fade));}
   this.pos.set(this.cuts[k],this.cuts[k+1],this.cuts[k+2]+.2);this.q.setFromAxisAngle(Z,a);this.size.set(age<.14?.12*(1-age/.14):0,1.7*s,1);this.matrix.compose(this.pos,this.q,this.size);this.flashes.setMatrixAt(i,this.matrix);this.flashes.setColorAt(i,this.tint.setHex(NEON_COLORS[this.cuts[k+9]]).lerp(this.white,.65));
  }
  for(let i=0;i<SPARKS;i++){const k=i*8,age=time-this.particles[k+6];if(!this.particles[k+7]||age<0||age>.32){this.particles[k+7]=0;this.zero();}else{this.liveSparks++;this.pos.set(this.particles[k]+this.particles[k+3]*age,this.particles[k+1]+this.particles[k+4]*age-age*age*2,this.particles[k+2]+this.particles[k+5]*age);this.q.setFromAxisAngle(Z,i*2.4);this.size.setScalar(1-age/.32);this.matrix.compose(this.pos,this.q,this.size);}this.sparks.setMatrixAt(i,this.matrix);}
  for(const mesh of this.meshes)mesh.instanceMatrix.needsUpdate=true;this.halves.instanceColor!.needsUpdate=true;this.flashes.instanceColor!.needsUpdate=true;
 }
 private zero(){this.matrix.makeScale(0,0,0);}
 reset(){this.cuts.fill(0);this.particles.fill(0);this.liveCuts=this.liveSparks=this.cutsCreated=this.nextCut=this.nextSpark=0;this.zero();for(const mesh of this.meshes){for(let i=0;i<mesh.count;i++)mesh.setMatrixAt(i,this.matrix);mesh.instanceMatrix.needsUpdate=true;}}
}
