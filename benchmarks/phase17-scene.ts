import * as T from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {Side} from '../src/gesture';
import {observeHand} from '../src/hand-presence';
import {BladeState,motionSpeed} from '../src/dynamics';
import {MotionFilter} from '../src/motion';
import {TrailBuffer} from '../src/trail';
import {PalmPose} from '../src/palm-pose';
import {HandTelemetry} from '../src/hand-telemetry';
import {TRACKING} from '../src/tracking-state';
import {Metric,ResolutionBudget} from '../src/metrics';
import type {ControlMode} from '../src/control-core';
import {WeaponControl} from '../src/weapon-control';
import type {ControlInput} from '../src/control-identity';
export type Quality='low'|'medium'|'high';
export const HILT_ORIGINAL_MIN=-.60,HILT_ORIGINAL_MAX=.12+.008*Math.sin(Math.PI/3);
export const HILT_EXTENSION=(HILT_ORIGINAL_MAX-HILT_ORIGINAL_MIN)/2,HILT_BOTTOM=HILT_ORIGINAL_MIN-HILT_EXTENSION;
const COLORS={Left:0x30aaff,Right:0xff2448};
const LENGTH=2.75;
const STREAM_ATTRIBUTES=['position','age'] as const;
type Saber={rear:T.Group;rearTrail:T.Mesh<T.BufferGeometry,T.ShaderMaterial>;rearRibbon:TrailBuffer;accent:T.MeshBasicMaterial;inner:T.ShaderMaterial;telemetry:HandTelemetry;hiltMaterials:T.Material[];group:T.Group;blade:T.Group;target:T.Vector3;rotation:T.Quaternion;motion:MotionFilter;palm:PalmPose;state:BladeState;trail:T.Mesh<T.BufferGeometry,T.ShaderMaterial>;ribbon:TrailBuffer;speed:number;measuredTip:T.Vector3;measuredTime:number;glow:T.ShaderMaterial;core:T.ShaderMaterial;light:T.PointLight};
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
 readonly control=new WeaponControl();controlMode:ControlMode='modern';controlEpoch=-Infinity;
 renderer:T.WebGLRenderer;scene=new T.Scene();camera=new T.PerspectiveCamera(43,1,.1,80);weapon:Saber;
 warmup={status:'尚未預熱',ms:0};private disposed=false;
 quality:Quality='medium';demo=false;fps=0;goldMix=0;rearExtension=0;
 readonly stats={frame:new Metric(),cpu:new Metric(),trail:new Metric(),audio:new Metric(),age:new Metric(),smoothing:new Metric()};
 readonly budget=new ResolutionBudget();pixelRatio=1;private budgetTime=0;private cameraRight=new T.Vector3(1,0,0);private budgetFrames=new Metric();private viewport=new T.Vector2();
 private frame=0;private last=performance.now();private sample=0;private frames=0;private observer:ResizeObserver;private environment:T.WebGLRenderTarget;
 private tip=new T.Vector3();private base=new T.Vector3();private euler=new T.Euler();private color=new T.Color();private gold=new T.Color(0xffd454);private goldHalo=new T.Color(0xffb627);private goldInner=new T.Color(0xffe46a);private white=new T.Color(0xffffff);private side:Side='Left';private demoTwin=false;private demoMode=false;private demoToggle=-Infinity;
 prepare(){if(this.warmup.status!=='尚未預熱')return;const began=performance.now(),s=this.weapon,visible=s.group.visible,b=s.blade.visible,r=s.rear.visible;s.group.visible=s.blade.visible=s.rear.visible=true;try{this.warmup.status='預熱中';void this.renderer.compileAsync(this.scene,this.camera).then(()=>{if(!this.disposed)this.warmup={status:'完成',ms:performance.now()-began};},()=>{if(!this.disposed)this.warmup={status:'預熱失敗：使用正常渲染路徑',ms:performance.now()-began};});}finally{s.group.visible=visible;s.blade.visible=b;s.rear.visible=r;}}
 constructor(private host:HTMLElement,private sound:(side:Side,active:boolean,speed:number,extension:number)=>void=()=>{},autoStart=true,private clock:()=>number=()=>performance.now(),private modeSound:(side:Side,extend:boolean)=>void=()=>{}){
  this.renderer=new T.WebGLRenderer({antialias:false,powerPreference:'high-performance',preserveDrawingBuffer:!autoStart});this.renderer.setClearColor(0x070b12);this.renderer.outputColorSpace=T.SRGBColorSpace;host.appendChild(this.renderer.domElement);
  this.camera.position.set(0,1,11);this.camera.lookAt(0,1,0);this.scene.fog=new T.FogExp2(0x070b12,.055);
  const pmrem=new T.PMREMGenerator(this.renderer),room=new RoomEnvironment();this.environment=pmrem.fromScene(room,.05);this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.75;room.dispose();pmrem.dispose();
  this.scene.add(new T.HemisphereLight(0x99c5ed,0x181621,1.7));
  const key=new T.DirectionalLight(0xe0edff,3.5);key.position.set(3,5,4);this.scene.add(key);
  const rim=new T.DirectionalLight(0x6c94d7,2);rim.position.set(-4,1,-2);this.scene.add(rim);
  const floor=new T.GridHelper(70,50,0x234258,0x132230);floor.position.y=-2.4;this.scene.add(floor);
  for(const z of [-7,-8]){const ring=new T.Mesh(new T.TorusGeometry(5.5,.012,4,96,Math.PI),new T.MeshBasicMaterial({color:0x1c3444}));ring.position.set(0,-1,z);this.scene.add(ring);}
  this.weapon=this.makeSaber(COLORS.Left,-1);
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);this.setQuality('medium');this.last=this.clock();if(autoStart){this.prepare();this.tick();}
 }
 private makeSaber(color:number,side:number):Saber{
  const group=new T.Group(),blade=new T.Group();group.add(blade);group.name="single-weapon";this.scene.add(group);
  const steel=new T.MeshStandardMaterial({color:0xb1becb,metalness:1,roughness:.24}),titanium=new T.MeshStandardMaterial({color:0x44525d,metalness:.92,roughness:.38}),rubber=new T.MeshStandardMaterial({color:0x080d13,metalness:.15,roughness:.82}),accent=new T.MeshBasicMaterial({color});
  const hiltMaterials=[steel,titanium,rubber,accent];for(const material of hiltMaterials)material.transparent=true;
  const add=(geometry:T.BufferGeometry,material:T.Material,y:number)=>{const mesh=new T.Mesh(geometry,material);mesh.position.y=y;group.add(mesh);return mesh;};
  const lathe=(profile:number[][],mat:T.Material,y=0)=>add(new T.LatheGeometry(profile.map(p=>new T.Vector2(p[0],p[1])),24),mat,y);
  // Machined emitter, recessed collar, segmented dark grip and beveled pommel.
  lathe([[.068,-.60-HILT_EXTENSION],[.086,-.59-HILT_EXTENSION],[.093,-.56-HILT_EXTENSION],[.093,-.51-HILT_EXTENSION],[.077,-.48-HILT_EXTENSION],[.077,-.14],[.093,-.10],[.093,-.025],[.117,0],[.117,.055],[.108,.08],[.073,.08]],steel);
  add(new T.CylinderGeometry(.080,.080,.34+HILT_EXTENSION,20),rubber,-.31-HILT_EXTENSION/2);
  const seam=new T.TorusGeometry(.084,.005,5,24);
  for(let i=0;i<Math.floor((.272+HILT_EXTENSION)/.068)+1;i++){const ring=add(seam,titanium,-.17-i*.068);ring.rotation.x=Math.PI/2;}
  for(let i=0;i<6;i++){const strip=add(new T.BoxGeometry(.012,.26+HILT_EXTENSION,.009),titanium,-.31-HILT_EXTENSION/2);const angle=i*Math.PI/3;strip.position.x=Math.sin(angle)*.079;strip.position.z=Math.cos(angle)*.079;strip.rotation.y=angle;}
  lathe([[.075,.025],[.096,.04],[.096,.10],[.081,.12],[.060,.12]],titanium);
  const emitter=add(new T.TorusGeometry(.070,.008,6,24),accent,.12);emitter.rotation.x=Math.PI/2;
  const button=add(new T.CylinderGeometry(.020,.026,.018,12),steel,-.10);button.rotation.x=Math.PI/2;button.position.z=.098;
  const led=add(new T.SphereGeometry(.013,10,8),accent,-.10);led.position.z=.112;
  const indicator=add(new T.BoxGeometry(.012,.05,.005),accent,-.41-HILT_EXTENSION);indicator.position.z=.082;
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
  const rear=blade.clone(true);rear.name='rear-blade';rear.position.y=HILT_BOTTOM;rear.rotation.z=Math.PI;group.add(rear);
  rear.traverse(o=>{if(o instanceof T.Mesh)o.material=(o.material as T.ShaderMaterial).clone();});
  const rearRibbon=new TrailBuffer(),rearGeometry=new T.BufferGeometry();
  rearGeometry.setAttribute('position',new T.BufferAttribute(rearRibbon.positions,3).setUsage(T.DynamicDrawUsage));rearGeometry.setAttribute('uv',new T.BufferAttribute(rearRibbon.uvs,2));rearGeometry.setAttribute('age',new T.BufferAttribute(rearRibbon.ages,1).setUsage(T.DynamicDrawUsage));rearGeometry.setDrawRange(0,0);
  const rearTrail=new T.Mesh(rearGeometry,trail.material.clone());rearTrail.frustumCulled=false;rearTrail.renderOrder=1;this.scene.add(rearTrail);blade.name='front-blade';
  return {telemetry:new HandTelemetry(),hiltMaterials,group,blade,rear,rearTrail,rearRibbon,accent,inner,target:new T.Vector3(side*1.55,-.5,0),rotation:new T.Quaternion(),motion:new MotionFilter(),palm:new PalmPose(),state:new BladeState(),trail,ribbon,speed:0,measuredTip:new T.Vector3(),measuredTime:NaN,glow,core,light};
 }
 setQuality(q:Quality){this.quality=q;this.budget.reset();this.applyBudget();}
 private applyBudget(){this.pixelRatio=Math.min(devicePixelRatio,this.quality==='low'?1:this.quality==='medium'?1.4:1.8)*this.budget.scale;this.renderer.setPixelRatio(this.pixelRatio);this.weapon.light.visible=this.quality==='high'&&this.budget.scale>.8;this.resize();}
 private resize(){const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;this.renderer.getSize(this.viewport);if(this.viewport.x!==w||this.viewport.y!==h)this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
 private clearWeapon(){const s=this.weapon;s.state.reset();s.motion.reset();s.palm.reset();s.group.visible=false;s.blade.visible=s.rear.visible=false;s.ribbon.reset();s.rearRibbon.reset();s.trail.geometry.setDrawRange(0,0);s.rearTrail.geometry.setDrawRange(0,0);s.speed=0;s.measuredTime=NaN;this.goldMix=this.rearExtension=0;this.sound(this.side,false,0,0);}
 hide(){this.control.reset();this.clearWeapon();this.demoMode=this.demoTwin=false;}
 setControlMode(mode:ControlMode){this.hide();this.controlMode=mode;this.controlEpoch=this.clock();this.weapon.telemetry.reset();for(const metric of Object.values(this.stats))metric.reset();}
 receiveControls(data:ControlInput){
  if(data.time<this.controlEpoch)return;const now=this.clock(),result=this.control.observe(data,now,this.camera.aspect,this.controlMode==='modern');if(!result)return;
  const s=this.weapon,{match,fresh,changed}=result;
  if(fresh){this.clearWeapon();this.side=this.control.primary!;s.accent.color.setHex(COLORS[this.side]);}
  s.telemetry.result(data.landmarks.length,!!match,!!match?.freeze,now);
  if(!match){s.state.markLost(data.landmarks.length?'主控手未配對':'MediaPipe 未回傳手部');s.state.poseFrozen=true;if(this.controlMode==='legacy')s.motion.freeze();s.speed=0;s.measuredTime=NaN;return;}
  s.state.observe(true,now);s.state.poseFrozen=!!match.freeze;
  if(match.freeze){if(this.controlMode==='legacy')s.motion.freeze();s.speed=0;s.measuredTime=NaN;return;}
  const p=data.landmarks[match.index],world=data.world?.[match.index],label=data.handedness[match.index]?.[0];s.telemetry.recordInput(label?.categoryName,label?.score,match.side,false,match.side==='Left'?this.control.identity.leftLabel:this.control.identity.leftLabel==='Right'?'Left':'Right');s.telemetry.delay.add(Math.max(0,now-data.time));
  if(this.controlMode==='modern'){s.target.copy(this.control.hand.pose.position);s.rotation.copy(this.control.hand.pose.rotation);}
  else{const observation=observeHand(p)!;s.rotation.copy(s.palm.update(p,world,match.side,data.time,data.aspect??4/3));const height=2*Math.tan(T.MathUtils.degToRad(21.5))*11;s.target.set((.5-observation.x)*height*this.camera.aspect,(.5-observation.y)*height+1,(p[5]&&p[17]&&Number.isFinite(p[5].x)&&Number.isFinite(p[17].x)&&Number.isFinite(p[5].y)&&Number.isFinite(p[17].y)?T.MathUtils.clamp((Math.hypot(p[5].x-p[17].x,p[5].y-p[17].y)-.12)*7,-1,1):s.target.z));s.motion.push(s.target,s.rotation,data.time,now,s.palm.reliable);s.telemetry.recordPose(s.palm);}
  if(data.time-s.measuredTime>250){s.ribbon.reset();s.rearRibbon.reset();}this.measure(data.time);
  if(changed)this.modeSound(this.side,this.control.mode.twin);
 }
 private measure(time:number){const s=this.weapon;this.tip.set(0,LENGTH+.12,0).applyQuaternion(s.rotation).add(s.target);const elapsed=Number.isFinite(s.measuredTime)?(time-s.measuredTime)/1000:0,speed=Number.isFinite(s.measuredTime)?motionSpeed(this.tip.distanceTo(s.measuredTip),elapsed):0;s.speed+=(speed-s.speed)*(1-Math.exp(-Math.max(0,elapsed)*18));s.measuredTip.copy(this.tip);s.measuredTime=time;}
 private updateTrail(rear:boolean,now:number,extension:number){const s=this.weapon,ribbon=rear?s.rearRibbon:s.ribbon,trail=rear?s.rearTrail:s.trail,maxAge=this.quality==='low'?.12:this.quality==='medium'?.18:.22;
  this.tip.set(0,rear?HILT_BOTTOM-LENGTH*extension:.12+LENGTH*extension,0).applyQuaternion(s.group.quaternion).add(s.group.position);this.base.set(0,rear?HILT_BOTTOM-.04:.16,0).applyQuaternion(s.group.quaternion).add(s.group.position);
  ribbon.update(this.base,this.tip,now,extension,maxAge,this.cameraRight,s.state.canMove);const previous=trail.geometry.drawRange.count;trail.geometry.setDrawRange(0,ribbon.vertices);if(ribbon.vertices||previous)for(const name of STREAM_ATTRIBUTES){const a=trail.geometry.attributes[name] as T.BufferAttribute;a.clearUpdateRanges();a.addUpdateRange(0,ribbon.vertices*(name==='position'?3:1));a.needsUpdate=true;}
 }
 private tick=()=>{this.frame=requestAnimationFrame(this.tick);this.renderFrame(this.clock());};
 renderFrame(now:number){
  const elapsed=(now-this.last)/1000,dt=Math.max(0,Math.min(elapsed,.05));this.last=now;if(document.hidden)return;
  const cpuStart=performance.now();this.stats.frame.add(elapsed*1000);this.frames++;this.sample+=elapsed;if(this.sample>.5){this.fps=Math.round(this.frames/this.sample);this.sample=0;this.frames=0;}
  if(elapsed>0&&elapsed<.1){this.budgetFrames.add(elapsed*1000);this.budgetTime+=elapsed;}else{this.budgetFrames.reset();this.budgetTime=0;}if(this.budgetTime>=1){if(this.budget.step(this.budgetFrames.snapshot().p95,this.budgetTime,now))this.applyBudget();this.budgetTime=0;}
  const s=this.weapon;
  if(!this.demo&&this.control.advance(now))this.clearWeapon();
  if(this.demo){const t=now*.0012,fit=Math.min(1,this.camera.aspect/1.4);s.target.set(Math.sin(t*1.7)*.8*fit,1.2+Math.cos(t)*.2,0);s.rotation.setFromEuler(this.euler.set(.2,Math.sin(t)*.4,(.4+Math.sin(t*1.7)*.65)*fit));s.group.position.copy(s.target);s.group.quaternion.copy(s.rotation);this.measure(now);s.state.observe(true,now);this.demoTwin=Math.floor(now/6500)%2===1;if(this.demoTwin!==this.demoMode){this.modeSound(this.side,this.demoTwin);this.demoMode=this.demoTwin;this.demoToggle=now;}}
  const extension=s.state.step(now,dt),tracked=s.state.visible(now);s.group.visible=tracked;
  if(!this.demo&&tracked){if(this.controlMode==='modern'){this.control.sample(now);s.group.position.copy(this.control.hand.position);s.group.quaternion.copy(this.control.hand.rotation);this.stats.age.add(Math.max(0,now-this.control.hand.time));s.telemetry.positionError.add(this.control.hand.position.distanceTo(s.target));s.telemetry.rotationError.add(T.MathUtils.radToDeg(this.control.hand.rotation.angleTo(s.rotation)));}else{if(!s.state.poseFrozen&&now-s.state.lastSeen<TRACKING.staleMs)s.motion.sample(now);else s.motion.freeze();s.group.position.copy(s.motion.position);s.group.quaternion.copy(s.motion.rotation);this.stats.smoothing.add(s.motion.lagMs);}}
  const twin=this.demo?this.demoTwin:this.control.mode.twin;
  this.rearExtension=T.MathUtils.clamp(this.rearExtension+(twin?dt/.16:-dt/.12),0,1);this.goldMix=T.MathUtils.clamp(this.goldMix+(twin?dt/.18:-dt/.15),0,1);
  const flash=twin?Math.max(0,1-(now-(this.demo?this.demoToggle:this.control.mode.lastToggle))/180):0;
  this.color.setHex(COLORS[this.side]).lerp(this.gold,this.goldMix);
  s.core.uniforms.color.value.copy(this.color);s.glow.uniforms.color.value.setHex(COLORS[this.side]).lerp(this.goldHalo,this.goldMix);s.inner.uniforms.color.value.setHex(COLORS[this.side]).lerp(this.goldInner,this.goldMix);s.trail.material.uniforms.color.value.copy(this.color).lerp(this.white,this.side==='Right'?.22:.1);
  this.animateBlade(s.blade,extension,now,flash,false);this.animateBlade(s.rear,extension*this.rearExtension,now,flash,true);
  s.rearTrail.material.uniforms.color.value.copy(this.gold);for(const material of s.hiltMaterials)material.opacity=s.state.fade(now);s.light.color.copy(this.color);if(s.light.visible)s.light.intensity=extension*1.8;
  const audioStart=performance.now(),speed=Number.isFinite(s.measuredTime)?s.speed*Math.exp(-Math.max(0,now-s.measuredTime-80)/100):0;this.sound(this.side,s.state.active,speed,extension);this.stats.audio.add(performance.now()-audioStart);
  const trailStart=performance.now();if(tracked){this.updateTrail(false,now,extension);this.updateTrail(true,now,extension*this.rearExtension);}else{s.ribbon.reset();s.rearRibbon.reset();s.trail.geometry.setDrawRange(0,0);s.rearTrail.geometry.setDrawRange(0,0);}this.stats.trail.add(performance.now()-trailStart);
  this.renderer.render(this.scene,this.camera);this.stats.cpu.add(performance.now()-cpuStart);
 }
 private animateBlade(blade:T.Group,extension:number,now:number,flash:number,gold:boolean){blade.scale.y=Math.max(.001,extension);blade.visible=extension>.001;for(let i=0;i<blade.children.length;i++){const mat=(blade.children[i] as T.Mesh<T.BufferGeometry,T.ShaderMaterial>).material;mat.uniforms.time.value=now/1000;if(gold)mat.uniforms.color.value.copy(i===0?this.gold:i===1?this.goldHalo:this.goldInner);if(mat.uniforms.power)mat.uniforms.power.value=(i===1?.75:.95)*(1+flash*.25);}}
 dispose(){this.disposed=true;cancelAnimationFrame(this.frame);this.observer.disconnect();this.hide();const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();this.scene.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.LineSegments){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();this.environment.dispose();this.renderer.dispose();this.renderer.domElement.remove();}
}
