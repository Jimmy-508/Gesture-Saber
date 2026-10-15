import * as T from 'three';
import type {Pose,Side} from './gesture';
export type Quality='low'|'medium'|'high';
type Saber={group:T.Group;blade:T.Group;target:T.Vector3;rotation:T.Quaternion;last:number;active:boolean;trail:T.Mesh<T.BufferGeometry,T.MeshBasicMaterial>;positions:Float32Array;history:Float32Array;count:number;prev:T.Vector3};
export class SaberScene {
 renderer:T.WebGLRenderer;scene=new T.Scene();camera=new T.PerspectiveCamera(43,1,.1,80);
 sabers:Record<Side,Saber>;quality:Quality='medium';demo=false;fps=0;
 private frame=0;private last=performance.now();private sample=0;private frames=0;private observer:ResizeObserver;
 private v=new T.Vector3();private axis=new T.Vector3();private normal=new T.Vector3();private x=new T.Vector3();private matrix=new T.Matrix4();private tip=new T.Vector3();private base=new T.Vector3();
 constructor(private host:HTMLElement){
  this.renderer=new T.WebGLRenderer({antialias:false,alpha:false,powerPreference:'high-performance'});
  this.renderer.setClearColor(0x070b12);this.renderer.outputColorSpace=T.SRGBColorSpace;
  host.appendChild(this.renderer.domElement);this.camera.position.set(0,1,11);this.camera.lookAt(0,1,0);
  this.scene.fog=new T.FogExp2(0x070b12,.055);
  this.scene.add(new T.HemisphereLight(0x90b9db,0x171425,2));
  const light=new T.DirectionalLight(0xffffff,3);light.position.set(3,5,6);this.scene.add(light);
  const floor=new T.GridHelper(70,50,0x234258,0x132230);floor.position.y=-2.4;this.scene.add(floor);
  for(const side of [-1,1]){
   const ring=new T.Mesh(new T.TorusGeometry(5.5,.015,4,96,Math.PI),new T.MeshBasicMaterial({color:0x1c3444}));ring.position.set(0,-1,-7-side);this.scene.add(ring);
  }
  const points=new Float32Array(180*3);for(let i=0;i<180;i++){points[i*3]=Math.sin(i*124.3)*24;points[i*3+1]=Math.cos(i*61.7)*15;points[i*3+2]=-8-Math.abs(Math.sin(i))*20;}
  const stars=new T.BufferGeometry();stars.setAttribute('position',new T.BufferAttribute(points,3));this.scene.add(new T.Points(stars,new T.PointsMaterial({color:0x668291,size:.025})));
  this.sabers={Left:this.makeSaber(0x39baff,-1),Right:this.makeSaber(0xff4965,1)};
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);this.setQuality('medium');this.tick();
 }
 private makeSaber(color:number,side:number):Saber{
  const group=new T.Group(),blade=new T.Group();this.scene.add(group);group.add(blade);
  const metal=new T.MeshStandardMaterial({color:0x778b9a,metalness:.85,roughness:.3});
  const dark=new T.MeshStandardMaterial({color:0x151d27,metalness:.7,roughness:.45});
  const cylinder=(radius:number,length:number,y:number,material:T.Material)=>{const m=new T.Mesh(new T.CylinderGeometry(radius,radius,length,12),material);m.position.y=y;group.add(m);};
  cylinder(.095,.65,-.32,metal);cylinder(.102,.4,-.33,dark);
  for(let i=0;i<6;i++)cylinder(.108,.025,-.15-i*.075,metal);
  cylinder(.135,.09,.01,metal);cylinder(.115,.09,-.66,metal);
  const accent=new T.MeshBasicMaterial({color});cylinder(.14,.025,.065,accent);
  const button=new T.Mesh(new T.SphereGeometry(.035,8,6),accent);button.position.set(0,-.12,.1);group.add(button);
  const core=new T.Mesh(new T.CylinderGeometry(.025,.035,2.6,8),new T.MeshBasicMaterial({color:0xf2fcff}));core.position.y=1.39;blade.add(core);
  for(let i=0;i<3;i++){
   const glow=new T.Mesh(new T.CylinderGeometry(.05+i*.035,.06+i*.035,2.64,8),new T.MeshBasicMaterial({color,transparent:true,opacity:[.65,.17,.065][i],blending:T.AdditiveBlending,depthWrite:false}));glow.position.y=1.39;blade.add(glow);
  }
  const positions=new Float32Array(24*6*3),geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage));
  const colors=new Float32Array(positions.length),c=new T.Color(color);for(let i=0;i<24;i++)for(let j=0;j<6;j++){const fade=Math.pow(1-i/24,2)*.45;const o=(i*6+j)*3;colors[o]=c.r*fade;colors[o+1]=c.g*fade;colors[o+2]=c.b*fade;}
  geometry.setAttribute('color',new T.BufferAttribute(colors,3));geometry.setDrawRange(0,0);
  const trail=new T.Mesh(geometry,new T.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.6,side:T.DoubleSide,blending:T.AdditiveBlending,depthWrite:false}));trail.frustumCulled=false;this.scene.add(trail);
  group.visible=false;
  return {group,blade,target:new T.Vector3(side*1.6,-.5,0),rotation:new T.Quaternion(),last:0,active:false,trail,positions,history:new Float32Array(25*6),count:0,prev:new T.Vector3()};
 }
 setQuality(q:Quality){this.quality=q;this.renderer.setPixelRatio(Math.min(devicePixelRatio,q==='low'?1:q==='medium'?1.5:2));this.resize();}
 private resize(){const w=this.host.clientWidth,h=this.host.clientHeight;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
 update(pose:Pose){
  const s=this.sabers[pose.side],p=pose.points,orientation=pose.world??p;
  // Mirror image coordinates once. Palm frame preserves all three rotation axes.
  const map=(i:number,out:T.Vector3)=>out.set(-orientation[i].x,-orientation[i].y,-orientation[i].z);
  map(9,this.axis);map(0,this.v);this.axis.sub(this.v).normalize();
  map(5,this.x);map(17,this.v);this.x.sub(this.v).normalize();
  this.normal.crossVectors(this.x,this.axis).normalize();this.x.crossVectors(this.axis,this.normal).normalize();
  this.matrix.makeBasis(this.x,this.axis,this.normal);s.rotation.setFromRotationMatrix(this.matrix);
  const cx=(p[0].x+p[5].x+p[9].x+p[17].x)/4,cy=(p[0].y+p[5].y+p[9].y+p[17].y)/4;
  const height=2*Math.tan(T.MathUtils.degToRad(43/2))*11;
  s.target.set((.5-cx)*height*this.camera.aspect,(.5-cy)*height+1,T.MathUtils.clamp((Math.hypot(p[5].x-p[17].x,p[5].y-p[17].y)-.12)*7,-1,1));
  s.active=pose.open;s.last=pose.time;
 }
 hide(){for(const s of Object.values(this.sabers)){s.active=false;s.last=0;s.count=0;s.trail.geometry.setDrawRange(0,0);s.group.visible=false;}}
 private tick=()=>{
  this.frame=requestAnimationFrame(this.tick);const now=performance.now(),dt=Math.min((now-this.last)/1000,.05);this.last=now;
  if(document.hidden)return;
  this.frames++;this.sample+=dt;if(this.sample>.5){this.fps=Math.round(this.frames/this.sample);this.frames=0;this.sample=0;}
  let index=0;
  for(const s of Object.values(this.sabers)){
   if(this.demo){const t=now*.0007+index*2;s.target.set((index?1:-1)*1.6+Math.sin(t)*.6,-.5+Math.cos(t)*.3,0);s.rotation.setFromEuler(new T.Euler(.1,Math.sin(t)*.3,(index?-1:1)*(.35+Math.sin(t)*.25)));s.active=true;s.last=now;}
   const visible=s.active&&now-s.last<180;s.group.visible=visible;
   if(!visible){s.count=0;s.trail.geometry.setDrawRange(0,0);index++;continue;}
   if(s.count===0){s.group.position.copy(s.target);s.group.quaternion.copy(s.rotation);}else{s.group.position.lerp(s.target,1-Math.exp(-dt*24));s.group.quaternion.slerp(s.rotation,1-Math.exp(-dt*22));}
   this.tip.set(0,2.7,0).applyQuaternion(s.group.quaternion).add(s.group.position);this.base.set(0,.1,0).applyQuaternion(s.group.quaternion).add(s.group.position);
   const speed=this.tip.distanceTo(s.prev)/Math.max(dt,.001);s.prev.copy(this.tip);
   s.history.copyWithin(6,0,24*6);s.history.set([this.base.x,this.base.y,this.base.z,this.tip.x,this.tip.y,this.tip.z],0);s.count=Math.min(s.count+1,25);
   for(let i=0;i<s.count-1;i++){
    const a=i*6,b=(i+1)*6,o=i*18,h=s.history,v=s.positions;
    v.set(h.subarray(a,a+6),o);v.set(h.subarray(b+3,b+6),o+6);v.set(h.subarray(a,a+3),o+9);v.set(h.subarray(b+3,b+6),o+12);v.set(h.subarray(b,b+3),o+15);
   }
   s.trail.material.opacity=T.MathUtils.clamp(speed*.025,.015,.55);s.trail.geometry.setDrawRange(0,(s.count-1)*6);s.trail.geometry.attributes.position.needsUpdate=true;index++;
  }
  this.renderer.render(this.scene,this.camera);
 };
 dispose(){cancelAnimationFrame(this.frame);this.observer.disconnect();this.scene.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Points||o instanceof T.LineSegments){o.geometry.dispose();const m=o.material;for(const material of Array.isArray(m)?m:[m])material.dispose();}});this.renderer.dispose();this.renderer.domElement.remove();}
}
