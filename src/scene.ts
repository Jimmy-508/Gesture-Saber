import * as T from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {Pose,Side} from './gesture';
import {observeHand} from './hand-presence';
import {BladeState,motionSpeed} from './dynamics';
import {MotionFilter} from './motion';
import {TrailBuffer} from './trail';
import {PalmPose} from './palm-pose';
import {HandTelemetry} from './hand-telemetry';
import {TRACKING} from './tracking-state';
import {Metric,ResolutionBudget} from './metrics';
export type Quality='low'|'medium'|'high';
const SIDES:Side[]=['Left','Right'];
const LENGTH=2.75;
const STREAM_ATTRIBUTES=['position','age'] as const;
type Saber={telemetry:HandTelemetry;hiltMaterials:T.Material[];group:T.Group;blade:T.Group;target:T.Vector3;rotation:T.Quaternion;motion:MotionFilter;palm:PalmPose;state:BladeState;trail:T.Mesh<T.BufferGeometry,T.ShaderMaterial>;ribbon:TrailBuffer;speed:number;measuredTip:T.Vector3;measuredTime:number;glow:T.ShaderMaterial;core:T.ShaderMaterial;light:T.PointLight};
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
void main(){float edge=pow(sin(clamp(vUv.y,0.,1.)*3.14159265),.65);if(vUv.x>1.5)edge*=pow(max(0.,sin((vUv.x-2.)*3.14159265)),.8);float a=vAge*edge*.52;gl_FragColor=vec4(color,a);}`;
export class SaberScene {
 renderer:T.WebGLRenderer;scene=new T.Scene();camera=new T.PerspectiveCamera(43,1,.1,80);sabers:Record<Side,Saber>;
 warmup={status:'尚未預熱',ms:0};private disposed=false;
 prepare(){if(this.warmup.status!=='尚未預熱')return;const began=performance.now();const l=this.sabers.Left,r=this.sabers.Right,lv=l.group.visible,rv=r.group.visible,lb=l.blade.visible,rb=r.blade.visible;l.group.visible=r.group.visible=l.blade.visible=r.blade.visible=true;try{const pending=this.renderer.compileAsync(this.scene,this.camera);this.warmup.status='預熱中';void pending.then(()=>{if(!this.disposed)this.warmup={status:'完成',ms:performance.now()-began};},()=>{if(!this.disposed)this.warmup={status:'預熱失敗：使用正常渲染路徑',ms:performance.now()-began};});}finally{l.group.visible=lv;r.group.visible=rv;l.blade.visible=lb;r.blade.visible=rb;}}
 quality:Quality='medium';demo=false;fps=0;
 readonly stats={frame:new Metric(),cpu:new Metric(),trail:new Metric(),audio:new Metric(),age:new Metric(),smoothing:new Metric()};
 readonly budget=new ResolutionBudget();pixelRatio=1;private budgetTime=0;private cameraRight=new T.Vector3(1,0,0);
 private budgetFrames=new Metric();
 private viewport=new T.Vector2();
 private frame=0;private last=performance.now();private sample=0;private frames=0;private observer:ResizeObserver;private environment:T.WebGLRenderTarget;
 private previousTarget=new T.Vector3();private previousRotation=new T.Quaternion();private tip=new T.Vector3();private base=new T.Vector3();private euler=new T.Euler();
 constructor(private host:HTMLElement,private sound:(side:Side,active:boolean,speed:number,extension:number)=>void=()=>{},autoStart=true,private clock:()=>number=()=>performance.now()){
  this.renderer=new T.WebGLRenderer({antialias:false,powerPreference:'high-performance',preserveDrawingBuffer:!autoStart});this.renderer.setClearColor(0x070b12);this.renderer.outputColorSpace=T.SRGBColorSpace;host.appendChild(this.renderer.domElement);
  this.camera.position.set(0,1,11);this.camera.lookAt(0,1,0);this.scene.fog=new T.FogExp2(0x070b12,.055);
  const pmrem=new T.PMREMGenerator(this.renderer),room=new RoomEnvironment();this.environment=pmrem.fromScene(room,.05);this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.75;room.dispose();pmrem.dispose();
  this.scene.add(new T.HemisphereLight(0x99c5ed,0x181621,1.7));
  const key=new T.DirectionalLight(0xe0edff,3.5);key.position.set(3,5,4);this.scene.add(key);
  const rim=new T.DirectionalLight(0x6c94d7,2);rim.position.set(-4,1,-2);this.scene.add(rim);
  const floor=new T.GridHelper(70,50,0x234258,0x132230);floor.position.y=-2.4;this.scene.add(floor);
  for(const z of [-7,-8]){const ring=new T.Mesh(new T.TorusGeometry(5.5,.012,4,96,Math.PI),new T.MeshBasicMaterial({color:0x1c3444}));ring.position.set(0,-1,z);this.scene.add(ring);}
  this.sabers={Left:this.makeSaber(0x30aaff,-1),Right:this.makeSaber(0xff2448,1)};
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);this.setQuality('medium');this.last=this.clock();if(autoStart){this.prepare();this.tick();}
 }
 private makeSaber(color:number,side:number):Saber{
  const group=new T.Group(),blade=new T.Group();group.add(blade);this.scene.add(group);
  const steel=new T.MeshStandardMaterial({color:0xb1becb,metalness:1,roughness:.24}),titanium=new T.MeshStandardMaterial({color:0x44525d,metalness:.92,roughness:.38}),rubber=new T.MeshStandardMaterial({color:0x080d13,metalness:.15,roughness:.82}),accent=new T.MeshBasicMaterial({color});
  const hiltMaterials=[steel,titanium,rubber,accent];for(const material of hiltMaterials)material.transparent=true;
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
  const glow=new T.ShaderMaterial({uniforms:{color:{value:new T.Color(color)},time:{value:0},power:{value:.75}},vertexShader:glowVertex,fragmentShader:glowFragment,transparent:true,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide,forceSinglePass:true});
  const outer=new T.PlaneGeometry(.62,2.98);outer.translate(0,1.43,0);const glowMesh=new T.Mesh(outer,glow);glowMesh.frustumCulled=false;blade.add(glowMesh);
  const inner=glow.clone();inner.uniforms.power.value=.95;const innerGeometry=new T.PlaneGeometry(.19,2.88);innerGeometry.translate(0,1.42,0);blade.add(new T.Mesh(innerGeometry,inner));
  const light=new T.PointLight(color,0,2,2);light.position.y=.35;group.add(light);
  const ribbon=new TrailBuffer(),geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.BufferAttribute(ribbon.positions,3).setUsage(T.DynamicDrawUsage));geometry.setAttribute('uv',new T.BufferAttribute(ribbon.uvs,2));geometry.setAttribute('age',new T.BufferAttribute(ribbon.ages,1).setUsage(T.DynamicDrawUsage));geometry.setDrawRange(0,0);
  // White-tinted independent colors compensate red's low perceived luminance. Geometry is identical.
  const trailColor=new T.Color(color).lerp(new T.Color(0xffffff),side>0?.22:.1);
  const trail=new T.Mesh(geometry,new T.ShaderMaterial({uniforms:{color:{value:trailColor}},vertexShader:trailVertex,fragmentShader:trailFragment,transparent:true,blending:T.AdditiveBlending,side:T.DoubleSide,forceSinglePass:true,depthWrite:false,depthTest:false}));trail.frustumCulled=false;trail.renderOrder=1;this.scene.add(trail);group.visible=false;
  // Batch static grip pieces by material; neither animation nor tracking changes these meshes.
  for(const mat of [steel,titanium,rubber,accent]){
   const parts=group.children.filter(o=>o instanceof T.Mesh&&o.material===mat) as T.Mesh[];
   if(parts.length<2)continue;const originals=new Set<T.BufferGeometry>();
   const copies=parts.map(mesh=>{mesh.updateMatrix();originals.add(mesh.geometry);return mesh.geometry.clone().applyMatrix4(mesh.matrix);});
   const merged=mergeGeometries(copies);if(merged){for(const mesh of parts)group.remove(mesh);group.add(new T.Mesh(merged,mat));for(const g of originals)g.dispose();}for(const g of copies)g.dispose();
  }
  return {telemetry:new HandTelemetry(),hiltMaterials,group,blade,target:new T.Vector3(side*1.55,-.5,0),rotation:new T.Quaternion(),motion:new MotionFilter(),palm:new PalmPose(),state:new BladeState(),trail,ribbon,speed:0,measuredTip:new T.Vector3(),measuredTime:NaN,glow,core,light};
 }
 setQuality(q:Quality){this.quality=q;this.budget.reset();this.applyBudget();}
 private applyBudget(){this.pixelRatio=Math.min(devicePixelRatio,this.quality==='low'?1:this.quality==='medium'?1.4:1.8)*this.budget.scale;this.renderer.setPixelRatio(this.pixelRatio);for(const side of SIDES)this.sabers[side].light.visible=this.quality==='high'&&this.budget.scale>.8;this.resize();}
 private resize(){const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;this.renderer.getSize(this.viewport);if(this.viewport.x!==w||this.viewport.y!==h)this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
 update(pose:Pose){
  const s=this.sabers[pose.side],p=pose.points;
  const observation=observeHand(p);if(!observation){this.lost(pose.side,pose.time,'觀測無效');return;}
  const previouslyReliable=s.palm.reliable;this.previousTarget.copy(s.target);this.previousRotation.copy(s.rotation);
  s.rotation.copy(s.palm.update(p,pose.world,pose.side,pose.time,pose.imageAspect??4/3));
  const {x:cx,y:cy}=observation,height=2*Math.tan(T.MathUtils.degToRad(21.5))*11;
  s.target.set((.5-cx)*height*this.camera.aspect,(.5-cy)*height+1,(p[5]&&p[17]&&Number.isFinite(p[5].x)&&Number.isFinite(p[17].x)&&Number.isFinite(p[5].y)&&Number.isFinite(p[17].y)?T.MathUtils.clamp((Math.hypot(p[5].x-p[17].x,p[5].y-p[17].y)-.12)*7,-1,1):s.target.z));
  if(Number.isFinite(s.motion.lastSample)){if(this.previousTarget.distanceTo(s.target)>1)s.telemetry.positionJumps++;if(this.previousRotation.angleTo(s.rotation)>Math.PI/3)s.telemetry.rotationJumps++;}
  if(s.palm.reliable&&!previouslyReliable&&Number.isFinite(s.motion.lastSample))s.telemetry.qualityRecoveries++;if(!s.palm.reliable)s.telemetry.fallbacks++;if(/歧義|突變|銜接/.test(s.palm.status))s.telemetry.guards++;s.telemetry.delay.add(Math.max(0,this.clock()-pose.time));
  if(pose.time-s.measuredTime>250)s.ribbon.reset();
  this.measure(s,pose.time);s.motion.push(s.target,s.rotation,pose.time,this.clock(),s.palm.reliable);s.state.observe(true,this.clock());
 }
 retain(side:Side,time:number){const s=this.sabers[side];s.state.observe(true,this.clock());s.telemetry.delay.add(Math.max(0,this.clock()-time));s.state.poseFrozen=true;s.palm.reliable=false;s.palm.status='身分歧義：保留姿態';s.motion.freeze();s.speed=0;s.measuredTime=NaN;}
 lost(side:Side,time:number,reason:string){const s=this.sabers[side];s.state.markLost(reason);}
 private measure(s:Saber,time:number){
  this.tip.set(0,LENGTH+.12,0).applyQuaternion(s.rotation).add(s.target);
  const elapsed=Number.isFinite(s.measuredTime)?(time-s.measuredTime)/1000:0;
  const speed=Number.isFinite(s.measuredTime)?motionSpeed(this.tip.distanceTo(s.measuredTip),elapsed):0;
  s.speed+=(speed-s.speed)*(1-Math.exp(-Math.max(0,elapsed)*18));s.measuredTip.copy(this.tip);s.measuredTime=time;
 }
 hide(){for(const side of SIDES){const s=this.sabers[side];s.state.reset();s.motion.reset();s.palm.reset();s.group.visible=false;s.ribbon.reset();s.speed=0;s.measuredTime=NaN;s.trail.geometry.setDrawRange(0,0);this.sound(side,false,0,0);}}
 private updateTrail(s:Saber,now:number){
  const maxAge=this.quality==='low'?.12:this.quality==='medium'?.18:.22;
  this.tip.set(0,.12+LENGTH*s.state.extension,0).applyQuaternion(s.group.quaternion).add(s.group.position);this.base.set(0,.16,0).applyQuaternion(s.group.quaternion).add(s.group.position);
  s.ribbon.update(this.base,this.tip,now,s.state.extension,maxAge,this.cameraRight,s.state.canMove);
  const previous=s.trail.geometry.drawRange.count;s.trail.geometry.setDrawRange(0,s.ribbon.vertices);
  if(s.ribbon.vertices||previous){for(const name of STREAM_ATTRIBUTES){const a=s.trail.geometry.attributes[name] as T.BufferAttribute;a.clearUpdateRanges();a.addUpdateRange(0,s.ribbon.vertices*(name==='position'?3:1));a.needsUpdate=true;}}
 }
 private tick=()=>{
  this.frame=requestAnimationFrame(this.tick);this.renderFrame(this.clock());
 };
 renderFrame(now:number){
  const elapsed=(now-this.last)/1000,dt=Math.min(elapsed,.05);this.last=now;if(document.hidden)return;
  const cpuStart=performance.now();this.stats.frame.add(elapsed*1000);this.frames++;this.sample+=elapsed;if(this.sample>.5){this.fps=Math.round(this.frames/this.sample);this.sample=0;this.frames=0;}
  if(elapsed>0&&elapsed<.1){this.budgetFrames.add(elapsed*1000);this.budgetTime+=elapsed;}else{this.budgetFrames.reset();this.budgetTime=0;}
  if(this.budgetTime>=1){if(this.budget.step(this.budgetFrames.snapshot().p95,this.budgetTime,now))this.applyBudget();this.budgetTime=0;}
  let i=0;
  for(const side of SIDES){
   const s=this.sabers[side];
   if(this.demo){const t=now*.0012,fit=Math.min(1,this.camera.aspect/1.4);s.target.set((i?1:-1)*(1.5+Math.sin(t*1.7)*.6)*fit,-.6+Math.cos(t)*.3,0);s.rotation.setFromEuler(this.euler.set(.2,Math.sin(t)*.4,(i?-1:1)*(.3+Math.sin(t*1.7)*.65)*fit));this.measure(s,now);s.motion.push(s.target,s.rotation,now,now);s.state.observe(Math.floor(now/5500)%3!==2,now);}
   const extension=s.state.step(now,dt),tracked=s.state.visible(now);s.group.visible=tracked;
   if(tracked){if(!s.state.poseFrozen&&now-s.state.lastSeen<TRACKING.staleMs)s.motion.sample(now);else s.motion.freeze();s.group.position.copy(s.motion.position);s.group.quaternion.copy(s.motion.rotation);if(!this.demo){this.stats.age.add(Math.max(0,now-s.measuredTime));this.stats.smoothing.add(s.motion.lagMs);s.telemetry.smoothing.add(s.motion.lagMs);}}
   for(const material of s.hiltMaterials)material.opacity=s.state.fade(now);
   s.blade.scale.y=Math.max(.001,extension);s.blade.visible=extension>.001;
   s.glow.uniforms.time.value=s.core.uniforms.time.value=now/1000;if(s.light.visible)s.light.intensity=extension*1.8;
   const audioStart=performance.now(),speed=Number.isFinite(s.measuredTime)?s.speed*Math.exp(-Math.max(0,now-s.measuredTime-80)/100):0;this.sound(side,s.state.active,speed,extension);this.stats.audio.add(performance.now()-audioStart);
   const trailStart=performance.now();if(tracked)this.updateTrail(s,now);else{s.ribbon.reset();s.trail.geometry.setDrawRange(0,0);}this.stats.trail.add(performance.now()-trailStart);i++;
  }
  this.renderer.render(this.scene,this.camera);
  this.stats.cpu.add(performance.now()-cpuStart);
 }
 dispose(){this.disposed=true;cancelAnimationFrame(this.frame);this.observer.disconnect();this.hide();const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();this.scene.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.LineSegments){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();this.environment.dispose();this.renderer.dispose();this.renderer.domElement.remove();}
}
