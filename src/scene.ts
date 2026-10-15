import * as T from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import type {Pose,Side} from './gesture';
import {BladeState,motionSpeed} from './dynamics';
export type Quality='low'|'medium'|'high';
const SIDES:Side[]=['Left','Right'];
const LENGTH=2.75,SAMPLES=32;
const TRIANGLE_OFFSETS=[0,3,9,0,9,6];
type Saber={group:T.Group;blade:T.Group;target:T.Vector3;rotation:T.Quaternion;state:BladeState;trail:T.Mesh<T.BufferGeometry,T.ShaderMaterial>;history:Float32Array;stamps:Float32Array;strengths:Float32Array;count:number;positions:Float32Array;uvs:Float32Array;ages:Float32Array;speed:number;measuredTip:T.Vector3;measuredTime:number;glow:T.ShaderMaterial;core:T.ShaderMaterial;light:T.PointLight};
const glowVertex=`varying vec2 vUv;
 void main(){vUv=uv;vec3 origin=(modelMatrix*vec4(0.,0.,0.,1.)).xyz;
 vec3 axis=normalize(mat3(modelMatrix)*vec3(0.,1.,0.));vec3 view=normalize(cameraPosition-origin);
 vec3 across=cross(axis,view);if(length(across)<.01)across=mat3(modelMatrix)*vec3(1.,0.,0.);across=normalize(across);
 float sy=length(modelMatrix[1].xyz);vec3 world=origin+axis*position.y*sy+across*position.x;
 gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}`;
const glowFragment=`uniform vec3 color;uniform float time;uniform float power;varying vec2 vUv;
 void main(){vec2 p=vec2((vUv.x-.5)*2.,vUv.y*8.5);float rounded=max(0.,p.y-7.65);
 float radius=length(vec2(p.x,rounded));float halo=exp(-radius*radius*6.5);
 float cap=smoothstep(0.,.28,p.y)*(1.-smoothstep(8.1,8.5,p.y));
 float pulse=1.+.025*sin(time*19.+p.y*10.);float a=halo*cap*power*pulse;
 gl_FragColor=vec4(color,a);}`;
const trailVertex=`attribute float age;varying vec2 vUv;varying float vAge;void main(){vUv=uv;vAge=age;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const trailFragment=`uniform vec3 color;varying vec2 vUv;varying float vAge;
void main(){float edge=pow(sin(clamp(vUv.y,0.,1.)*3.14159265),.65);float a=vAge*edge*.25;gl_FragColor=vec4(color,a);}`;
export class SaberScene {
 renderer:T.WebGLRenderer;scene=new T.Scene();camera=new T.PerspectiveCamera(43,1,.1,80);sabers:Record<Side,Saber>;
 quality:Quality='medium';demo=false;fps=0;
 private frame=0;private last=performance.now();private sample=0;private frames=0;private observer:ResizeObserver;private environment:T.WebGLRenderTarget;
 private v=new T.Vector3();private axis=new T.Vector3();private normal=new T.Vector3();private x=new T.Vector3();private matrix=new T.Matrix4();private tip=new T.Vector3();private base=new T.Vector3();private euler=new T.Euler();
 constructor(private host:HTMLElement,private sound:(side:Side,active:boolean,speed:number,extension:number)=>void=()=>{}){
  this.renderer=new T.WebGLRenderer({antialias:false,powerPreference:'high-performance'});this.renderer.setClearColor(0x070b12);this.renderer.outputColorSpace=T.SRGBColorSpace;host.appendChild(this.renderer.domElement);
  this.camera.position.set(0,1,11);this.camera.lookAt(0,1,0);this.scene.fog=new T.FogExp2(0x070b12,.055);
  const pmrem=new T.PMREMGenerator(this.renderer),room=new RoomEnvironment();this.environment=pmrem.fromScene(room,.05);this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.75;room.dispose();pmrem.dispose();
  this.scene.add(new T.HemisphereLight(0x99c5ed,0x181621,1.7));
  const key=new T.DirectionalLight(0xe0edff,3.5);key.position.set(3,5,4);this.scene.add(key);
  const rim=new T.DirectionalLight(0x6c94d7,2);rim.position.set(-4,1,-2);this.scene.add(rim);
  const floor=new T.GridHelper(70,50,0x234258,0x132230);floor.position.y=-2.4;this.scene.add(floor);
  for(const z of [-7,-8]){const ring=new T.Mesh(new T.TorusGeometry(5.5,.012,4,96,Math.PI),new T.MeshBasicMaterial({color:0x1c3444}));ring.position.set(0,-1,z);this.scene.add(ring);}
  this.sabers={Left:this.makeSaber(0x30aaff,-1),Right:this.makeSaber(0xff2448,1)};
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);this.setQuality('medium');this.tick();
 }
 private makeSaber(color:number,side:number):Saber{
  const group=new T.Group(),blade=new T.Group();group.add(blade);this.scene.add(group);
  const steel=new T.MeshStandardMaterial({color:0xb1becb,metalness:1,roughness:.24}),titanium=new T.MeshStandardMaterial({color:0x44525d,metalness:.92,roughness:.38}),rubber=new T.MeshStandardMaterial({color:0x080d13,metalness:.15,roughness:.82}),accent=new T.MeshBasicMaterial({color});
  const add=(geometry:T.BufferGeometry,material:T.Material,y:number)=>{const mesh=new T.Mesh(geometry,material);mesh.position.y=y;group.add(mesh);return mesh;};
  const lathe=(profile:number[][],mat:T.Material,y=0)=>add(new T.LatheGeometry(profile.map(p=>new T.Vector2(p[0],p[1])),24),mat,y);
  // Machined emitter, recessed collar, segmented dark grip and beveled pommel.
  lathe([[.068,-.60],[.086,-.59],[.093,-.56],[.093,-.51],[.077,-.48],[.077,-.14],[.093,-.10],[.093,-.025],[.117,0],[.117,.055],[.108,.08],[.073,.08]],steel);
  add(new T.CylinderGeometry(.080,.080,.34,20),rubber,-.31);
  const seam=new T.TorusGeometry(.084,.005,5,24);
  for(let i=0;i<5;i++){const ring=add(seam,titanium,-.17-i*.068);ring.rotation.x=Math.PI/2;}
  for(let i=0;i<6;i++){const strip=add(new T.BoxGeometry(.012,.26,.009),titanium,-.31);const angle=i*Math.PI/3;strip.position.x=Math.sin(angle)*.079;strip.position.z=Math.cos(angle)*.079;strip.rotation.y=angle;}
  lathe([[.075,.025],[.096,.04],[.096,.10],[.081,.12],[.060,.12]],titanium);
  const emitter=add(new T.TorusGeometry(.070,.008,6,24),accent,.12);emitter.rotation.x=Math.PI/2;
  const button=add(new T.CylinderGeometry(.020,.026,.018,12),steel,-.10);button.rotation.x=Math.PI/2;button.position.z=.098;
  const led=add(new T.SphereGeometry(.013,10,8),accent,-.10);led.position.z=.112;
  const indicator=add(new T.BoxGeometry(.012,.05,.005),accent,-.41);indicator.position.z=.082;
  blade.position.y=.12;
  const profile=[[0,0],[.022,.012],[.033,.04],[.033,LENGTH-.10],[.030,LENGTH-.045],[.020,LENGTH-.012],[0,LENGTH]];
  const core=new T.ShaderMaterial({uniforms:{time:{value:0},color:{value:new T.Color(color)}},vertexShader:`varying float height;void main(){height=position.y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`uniform float time;uniform vec3 color;varying float height;void main(){float flow=.02*sin(height*51.-time*18.)+.012*sin(height*19.+time*9.);gl_FragColor=vec4(mix(vec3(1.),color,.065+flow),1.);}`});
  blade.add(new T.Mesh(new T.LatheGeometry(profile.map(p=>new T.Vector2(p[0],p[1])),16),core));
  const glow=new T.ShaderMaterial({uniforms:{color:{value:new T.Color(color)},time:{value:0},power:{value:.75}},vertexShader:glowVertex,fragmentShader:glowFragment,transparent:true,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide});
  const outer=new T.PlaneGeometry(.62,2.98);outer.translate(0,1.43,0);const glowMesh=new T.Mesh(outer,glow);glowMesh.frustumCulled=false;blade.add(glowMesh);
  const inner=glow.clone();inner.uniforms.power.value=.95;const innerGeometry=new T.PlaneGeometry(.19,2.88);innerGeometry.translate(0,1.42,0);blade.add(new T.Mesh(innerGeometry,inner));
  const light=new T.PointLight(color,0,2,2);light.position.y=.35;group.add(light);
  const positions=new Float32Array((SAMPLES-1)*6*3),uvs=new Float32Array((SAMPLES-1)*6*2),ages=new Float32Array((SAMPLES-1)*6),geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage));geometry.setAttribute('uv',new T.BufferAttribute(uvs,2));geometry.setAttribute('age',new T.BufferAttribute(ages,1).setUsage(T.DynamicDrawUsage));geometry.setDrawRange(0,0);
  for(let i=0;i<SAMPLES-1;i++){uvs.set([0,0,0,1,1,1,0,0,1,1,1,0],i*12);}
  const trail=new T.Mesh(geometry,new T.ShaderMaterial({uniforms:{color:{value:new T.Color(color)}},vertexShader:trailVertex,fragmentShader:trailFragment,transparent:true,blending:T.AdditiveBlending,side:T.DoubleSide,depthWrite:false}));trail.frustumCulled=false;this.scene.add(trail);group.visible=false;
  return {group,blade,target:new T.Vector3(side*1.55,-.5,0),rotation:new T.Quaternion(),state:new BladeState(),trail,history:new Float32Array(SAMPLES*6),stamps:new Float32Array(SAMPLES),strengths:new Float32Array(SAMPLES),count:0,positions,uvs,ages,speed:0,measuredTip:new T.Vector3(),measuredTime:0,glow,core,light};
 }
 setQuality(q:Quality){this.quality=q;this.renderer.setPixelRatio(Math.min(devicePixelRatio,q==='low'?1:q==='medium'?1.4:1.8));this.resize();}
 private resize(){const w=this.host.clientWidth,h=this.host.clientHeight;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
 update(pose:Pose){
  const s=this.sabers[pose.side],p=pose.points,o=pose.world??p;
  const map=(i:number,v:T.Vector3)=>v.set(-o[i].x,-o[i].y,-o[i].z);
  map(9,this.axis);map(0,this.v);this.axis.sub(this.v).normalize();map(5,this.x);map(17,this.v);this.x.sub(this.v).normalize();
  this.normal.crossVectors(this.x,this.axis);if(this.normal.lengthSq()<.0001)return;this.normal.normalize();this.x.crossVectors(this.axis,this.normal).normalize();this.matrix.makeBasis(this.x,this.axis,this.normal);s.rotation.setFromRotationMatrix(this.matrix);
  const cx=(p[0].x+p[5].x+p[9].x+p[17].x)/4,cy=(p[0].y+p[5].y+p[9].y+p[17].y)/4,height=2*Math.tan(T.MathUtils.degToRad(21.5))*11;
  s.target.set((.5-cx)*height*this.camera.aspect,(.5-cy)*height+1,T.MathUtils.clamp((Math.hypot(p[5].x-p[17].x,p[5].y-p[17].y)-.12)*7,-1,1));
  if(pose.time-s.measuredTime>400){s.group.position.copy(s.target);s.group.quaternion.copy(s.rotation);s.count=0;}
  this.measure(s,pose.time);s.state.observe(pose.open,pose.time);
 }
 private measure(s:Saber,time:number){
  this.tip.set(0,LENGTH+.12,0).applyQuaternion(s.rotation).add(s.target);
  const elapsed=(time-s.measuredTime)/1000;
  const speed=s.measuredTime?motionSpeed(this.tip.distanceTo(s.measuredTip),elapsed):0;
  s.speed+=(speed-s.speed)*.55;s.measuredTip.copy(this.tip);s.measuredTime=time;
 }
 hide(){for(const side of SIDES){const s=this.sabers[side];s.state.reset();s.group.visible=false;s.count=0;s.speed=0;s.measuredTime=0;s.trail.geometry.setDrawRange(0,0);this.sound(side,false,0,0);}}
 private updateTrail(s:Saber,now:number){
  const h=s.history,maxAge=this.quality==='low'?.11:this.quality==='medium'?.16:.21;
  this.tip.set(0,.12+LENGTH*s.state.extension,0).applyQuaternion(s.group.quaternion).add(s.group.position);this.base.set(0,.16,0).applyQuaternion(s.group.quaternion).add(s.group.position);
  // Sample only real movement; clear on discontinuities/reacquisition to avoid triangles across the screen.
  const distance=s.count?Math.hypot(this.tip.x-h[3],this.tip.y-h[4],this.tip.z-h[5]):0;
  if(distance>1.8)s.count=0;
  if(s.state.extension>.75&&s.speed>.6&&(s.count===0||distance>.018)){
   const steps=s.count?Math.min(5,Math.max(1,Math.ceil(distance/.1))):1;
   const bx=s.count?h[0]:this.base.x,by=s.count?h[1]:this.base.y,bz=s.count?h[2]:this.base.z,tx=s.count?h[3]:this.tip.x,ty=s.count?h[4]:this.tip.y,tz=s.count?h[5]:this.tip.z;
   const oldStamp=s.count?s.stamps[0]:now;
   for(let j=1;j<=steps;j++){
    h.copyWithin(6,0,(SAMPLES-1)*6);s.stamps.copyWithin(1,0,SAMPLES-1);s.strengths.copyWithin(1,0,SAMPLES-1);const f=j/steps;
    h[0]=T.MathUtils.lerp(bx,this.base.x,f);h[1]=T.MathUtils.lerp(by,this.base.y,f);h[2]=T.MathUtils.lerp(bz,this.base.z,f);h[3]=T.MathUtils.lerp(tx,this.tip.x,f);h[4]=T.MathUtils.lerp(ty,this.tip.y,f);h[5]=T.MathUtils.lerp(tz,this.tip.z,f);
    s.stamps[0]=T.MathUtils.lerp(oldStamp,now,f);s.strengths[0]=T.MathUtils.clamp(s.speed/10,0,1);s.count=Math.min(SAMPLES,s.count+1);
   }
  }
  let segments=0;
  for(let i=0;i<s.count-1;i++){
   const age=(now-s.stamps[i+1])/1000;if(age>maxAge)break;
   const a=i*6,b=a+6,start=i*18;
   // Shared edge vertex values on adjacent quads; no flat per-face opacity.
   for(let j=0;j<6;j++){const src=a+TRIANGLE_OFFSETS[j],dst=start+j*3;s.positions[dst]=h[src];s.positions[dst+1]=h[src+1];s.positions[dst+2]=h[src+2];const sample=src<b?i:i+1;const fade=Math.max(0,1-(now-s.stamps[sample])/1000/maxAge);s.ages[i*6+j]=fade*fade*s.strengths[sample];}
   segments++;
  }
  s.trail.geometry.setDrawRange(0,segments*6);s.trail.geometry.attributes.position.needsUpdate=true;s.trail.geometry.attributes.age.needsUpdate=true;
  if(s.count&&(now-s.stamps[0])/1000>maxAge)s.count=0;
 }
 private tick=()=>{
  this.frame=requestAnimationFrame(this.tick);const now=performance.now(),elapsed=(now-this.last)/1000,dt=Math.min(elapsed,.05);this.last=now;if(document.hidden)return;
  this.frames++;this.sample+=elapsed;if(this.sample>.5){this.fps=Math.round(this.frames/this.sample);this.sample=0;this.frames=0;}
  let i=0;
  for(const side of SIDES){
   const s=this.sabers[side];
   if(this.demo){const t=now*.0009+i*1.5;s.target.set((i?1:-1)*1.5+Math.sin(t*1.7)*.7,-.6+Math.cos(t)*.3,0);s.rotation.setFromEuler(this.euler.set(.2,Math.sin(t)*.4,(i?-1:1)*(.3+Math.sin(t*1.7)*.65)));this.measure(s,now);s.state.observe(Math.floor(now/5500)%3!==2,now);}
   const extension=s.state.step(now,dt),tracked=now-s.state.lastSeen<420,wasVisible=s.group.visible;s.group.visible=tracked;
   if(tracked){const snap=now-s.measuredTime>400||!wasVisible;if(snap){s.group.position.copy(s.target);s.group.quaternion.copy(s.rotation);}else{s.group.position.lerp(s.target,1-Math.exp(-dt*27));s.group.quaternion.slerp(s.rotation,1-Math.exp(-dt*24));}}
   s.blade.scale.y=Math.max(.001,extension);s.blade.visible=extension>.001;
   s.glow.uniforms.time.value=s.core.uniforms.time.value=now/1000;s.light.intensity=this.quality==='low'?0:extension*1.8;
   const speed=s.speed*Math.exp(-Math.max(0,now-s.measuredTime-80)/100);this.sound(side,s.state.active,speed,extension);
   if(tracked)this.updateTrail(s,now);else{s.count=0;s.trail.geometry.setDrawRange(0,0);}i++;
  }
  this.renderer.render(this.scene,this.camera);
 };
 dispose(){cancelAnimationFrame(this.frame);this.observer.disconnect();this.hide();const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();this.scene.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.LineSegments){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();this.environment.dispose();this.renderer.dispose();this.renderer.domElement.remove();}
}
