import {Group,InstancedMesh,OctahedronGeometry,IcosahedronGeometry,BoxGeometry,MeshBasicMaterial,AdditiveBlending,Matrix4,Vector3,Quaternion,Color,BufferGeometry,Float32BufferAttribute,LineBasicMaterial,LineSegments} from 'three';
import type {SaberScene} from './scene.ts';
import {BLADE_LENGTH} from './saber-spec.ts';
import {BladeCollider,type BladeSegment} from './rhythm-collision.ts';
import {ScoreBoard,makeChart,targetZ,HIT_WINDOW,PERFECT_WINDOW,TARGET_RADIUS,type TargetEvent,type MusicAnalysis} from './rhythm-chart.ts';
import type {MusicTransport} from './music.ts';
const CAPACITY=12,PARTICLES=96;
const STRIKE_HEIGHT=2*Math.tan(21.5*Math.PI/180)*11;
const segment=():BladeSegment=>({a:new Vector3(),b:new Vector3(),active:false});
/** Bounded CPU/GPU pools; no musical analysis or React updates in this loop. */
export class RhythmGame{
 readonly root=new Group();readonly score=new ScoreBoard();chart:TargetEvent[]=[];active=false;
 private targets=new Array<TargetEvent|null>(CAPACITY).fill(null);private outcome=new Uint8Array(0);private protectedEvents=new Uint8Array(0);private cursor=0;
 private body:InstancedMesh;private edge:InstancedMesh;private cores:InstancedMesh;private tails:InstancedMesh;private shards:InstancedMesh;private strike:LineSegments;private particle=new Float32Array(PARTICLES*8);private nextParticle=0;
 private matrix=new Matrix4();private position=new Vector3();private scale=new Vector3();private rotation=new Quaternion();private axis=new Vector3(0,1,0);private color=new Color();private collider=new BladeCollider();private blades=[segment(),segment()];private previous=[segment(),segment()];
 private lastTime=-Infinity;private lastFrame=-Infinity;private serial=-1;private previousValid=false;private safeUntil=-Infinity;private paused=true;private graceUntil=-Infinity;
 hits=0;updates=0;collisionChecks=0;peakTargets=0;
 private scene:SaberScene;private music:MusicTransport;private sound:()=>void;
 constructor(scene:SaberScene,music:MusicTransport,sound:()=>void=()=>{}){
  this.scene=scene;this.music=music;this.sound=sound;
  this.root.name='rhythm-targets';this.body=new InstancedMesh(new OctahedronGeometry(TARGET_RADIUS),new MeshBasicMaterial({fog:false,color:0xffffff,transparent:true,opacity:.65,depthWrite:false}),CAPACITY);
  this.edge=new InstancedMesh(new OctahedronGeometry(TARGET_RADIUS*1.04),new MeshBasicMaterial({fog:false,color:0xffffff,wireframe:true,transparent:true,opacity:.9,blending:AdditiveBlending,depthWrite:false}),CAPACITY);
  this.cores=new InstancedMesh(new IcosahedronGeometry(.12,0),new MeshBasicMaterial({fog:false,color:0xdfffff}),CAPACITY);
  this.tails=new InstancedMesh(new BoxGeometry(.045,.045,1.5),new MeshBasicMaterial({fog:false,color:0xffffff,transparent:true,opacity:.35,blending:AdditiveBlending,depthWrite:false}),CAPACITY);
  this.shards=new InstancedMesh(new IcosahedronGeometry(.065,0),new MeshBasicMaterial({fog:false,color:0xffffff,transparent:true,opacity:.85,blending:AdditiveBlending,depthWrite:false}),PARTICLES);
  for(const mesh of [this.body,this.edge,this.cores,this.tails,this.shards]){mesh.frustumCulled=false;this.root.add(mesh);}
  const geometry=new BufferGeometry();const vertices:number[]=[];for(const x of [-2.25,2.25])for(const y of [-.2,2.5])vertices.push(x,y+(y<0?.22:-.22),0,x,y,0,x,y,0,x+(x<0?.25:-.25),y,0);geometry.setAttribute('position',new Float32BufferAttribute(vertices,3));this.strike=new LineSegments(geometry,new LineBasicMaterial({color:0x428493,transparent:true,opacity:.55}));this.root.add(this.strike);
  for(let i=0;i<CAPACITY;i++){this.color.setHex([0x39d9ff,0xa176ff,0xff55b9][i%3]);this.body.setColorAt(i,this.color);this.edge.setColorAt(i,this.color);this.tails.setColorAt(i,this.color);this.cores.setColorAt(i,this.color.clone().lerp(new Color(0xffffff),.7));}for(let i=0;i<PARTICLES;i++)this.shards.setColorAt(i,this.color.setHex(0x8aefff));this.reset();this.root.visible=false;scene.scene.add(this.root);scene.onFrame=now=>this.update(now);
 }
 setMusic(analysis:MusicAnalysis|null){this.chart=analysis?makeChart(analysis):[];this.outcome=new Uint8Array(this.chart.length);this.protectedEvents=new Uint8Array(this.chart.length);this.reset();}
 prepare(){const visible=this.root.visible;this.root.visible=true;try{void this.scene.renderer.compileAsync(this.scene.scene,this.scene.camera).catch(()=>{});}finally{this.root.visible=visible;}}
 reset(){this.targets.fill(null);this.outcome.fill(0);this.protectedEvents.fill(0);this.cursor=0;this.score.reset();this.particle.fill(0);this.nextParticle=0;this.lastTime=this.lastFrame=-Infinity;this.previousValid=false;this.safeUntil=this.graceUntil=-Infinity;this.hits=this.updates=this.collisionChecks=this.peakTargets=0;this.clearMeshes();}
 start(){this.reset();this.active=true;this.root.visible=true;}
 stop(){this.active=false;this.root.visible=false;this.previousValid=false;this.targets.fill(null);this.particle.fill(0);this.clearMeshes();}
 private clearMeshes(){this.scale.setScalar(0);this.matrix.compose(this.position.set(0,0,0),this.rotation.identity(),this.scale);for(const mesh of [this.body,this.edge,this.cores,this.tails,this.shards]){for(let i=0;i<mesh.count;i++)mesh.setMatrixAt(i,this.matrix);mesh.instanceMatrix.needsUpdate=true;}}
 private readBlades(){const w=this.scene.weapon;w.group.updateWorldMatrix(true,true);for(let i=0;i<2;i++){const blade=i===0?w.blade:w.rear,out=this.blades[i];out.active=w.group.visible&&blade.visible&&blade.scale.y>.08;out.a.set(0,0,0).applyMatrix4(blade.matrixWorld);out.b.set(0,BLADE_LENGTH,0).applyMatrix4(blade.matrixWorld);}}
 private burst(time:number,point:Vector3,colorIndex:number){for(let i=0;i<8;i++){const index=this.nextParticle++%PARTICLES,k=index*8,a=i*Math.PI/4;this.particle[k]=point.x;this.particle[k+1]=point.y;this.particle[k+2]=point.z;this.particle[k+3]=Math.cos(a)*(1.4+i*.12);this.particle[k+4]=Math.sin(a)*(1.6+i*.1);this.particle[k+5]=Math.sin(i*5.3)*1.4;this.particle[k+6]=time;this.particle[k+7]=1;this.shards.setColorAt(index,this.color.setHex([0x39d9ff,0xa176ff,0xff55b9][colorIndex%3]));}if(this.shards.instanceColor)this.shards.instanceColor.needsUpdate=true;}
 update(now:number){if(!this.active)return;this.updates++;const time=this.music.gameTime(),running=this.music.running;
  if(!running&&this.music.status!=='ended'){this.previousValid=false;this.paused=true;return;}
  const fresh=this.scene.weapon.state.canMove&&now-this.scene.control.hand.lastSeen<160&&this.scene.weapon.group.visible&&!this.scene.demo;
  const continuous=fresh&&this.previousValid&&this.serial===this.scene.control.serial&&now-this.lastFrame<70&&!this.paused;
  this.readBlades();
  if(fresh&&(!this.previousValid||this.serial!==this.scene.control.serial))this.safeUntil=now+70;
  this.serial=this.scene.control.serial;
  // Any target whose judgement window meets a real morph is exempted, rather
  // than changing its hitTime or slowing music. No score/combo penalty or bonus.
  if(this.scene.morph.transitioning)this.graceUntil=time+.12;
  while(this.cursor<this.chart.length&&this.chart[this.cursor].spawnTime<=time){const event=this.chart[this.cursor++];if(this.outcome[event.id])continue;if(time>event.hitTime+HIT_WINDOW){this.outcome[event.id]=2;this.score.apply('Miss');continue;}const slot=this.targets.indexOf(null);if(slot>=0)this.targets[slot]=event;else{this.outcome[event.id]=3;this.score.apply('Safe');}}
  const halfWidth=STRIKE_HEIGHT*(this.scene.camera?.aspect??1.6)*.5,fit=Math.min(1,Math.max(.25,(halfWidth-.55)/1.6));this.strike.scale.x=Math.min(1,Math.max(.25,(halfWidth-.1)/2.25));let count=0;
  for(let i=0;i<CAPACITY;i++){const event=this.targets[i];if(!event){this.scale.setScalar(0);this.matrix.compose(this.position.set(0,0,0),this.rotation.identity(),this.scale);}else{
    count++;const delta=time-event.hitTime;this.position.set(event.x*fit,event.y,targetZ(event,time));
    if(time>=event.hitTime-HIT_WINDOW&&time<=event.hitTime+HIT_WINDOW&&time<=this.graceUntil)this.protectedEvents[event.id]=1;
    let hit=false;if(fresh&&now>=this.safeUntil&&!this.scene.morph.transitioning&&Math.abs(delta)<=HIT_WINDOW){for(let b=0;b<2;b++){this.collisionChecks++;if(this.collider.touches(this.position,TARGET_RADIUS,this.blades[b],this.previous[b],continuous)){hit=true;break;}}}
    if(hit){this.outcome[event.id]=1;this.targets[i]=null;this.score.apply(Math.abs(delta)<=PERFECT_WINDOW?'Perfect':'Good');this.hits++;this.burst(time,this.collider.contact,event.id);this.sound();this.scale.setScalar(0);}
    else if(delta>HIT_WINDOW){this.outcome[event.id]=this.protectedEvents[event.id]?3:2;this.targets[i]=null;this.score.apply(this.protectedEvents[event.id]?'Safe':'Miss');this.scale.setScalar(0);}
    else{const approach=Math.max(0,Math.min(1,(time-event.spawnTime)/event.travelDuration));this.scale.setScalar(.55+.45*approach);}
    this.rotation.setFromAxisAngle(this.axis,time*.8+event.id);this.matrix.compose(this.position,this.rotation,this.scale);
   }this.body.setMatrixAt(i,this.matrix);this.edge.setMatrixAt(i,this.matrix);this.scale.multiplyScalar(1.15);this.matrix.compose(this.position,this.rotation,this.scale);this.cores.setMatrixAt(i,this.matrix);this.position.z-=1.0;this.rotation.identity();this.matrix.compose(this.position,this.rotation,this.scale);this.tails.setMatrixAt(i,this.matrix);
  }
  this.peakTargets=Math.max(this.peakTargets,count);for(const mesh of [this.body,this.edge,this.cores,this.tails])mesh.instanceMatrix.needsUpdate=true;
  for(let i=0;i<PARTICLES;i++){const k=i*8,age=time-this.particle[k+6];if(!this.particle[k+7]||age<0||age>.4)this.scale.setScalar(0);else{this.position.set(this.particle[k]+this.particle[k+3]*age,this.particle[k+1]+this.particle[k+4]*age-age*age*2,this.particle[k+2]+this.particle[k+5]*age);this.scale.setScalar(1-age/.4);}this.matrix.compose(this.position,this.rotation,this.scale);this.shards.setMatrixAt(i,this.matrix);}this.shards.instanceMatrix.needsUpdate=true;
  for(let i=0;i<2;i++){this.previous[i].a.copy(this.blades[i].a);this.previous[i].b.copy(this.blades[i].b);this.previous[i].active=this.blades[i].active;}
  this.lastTime=time;this.lastFrame=now;this.previousValid=fresh;this.paused=false;
 }
 get remaining(){return this.chart.length-this.score.perfect-this.score.good-this.score.miss-this.score.safe;}
 dispose(){if(this.scene.onFrame)this.scene.onFrame=null;this.stop();this.scene.scene.remove(this.root);this.root.traverse(o=>{if(o instanceof InstancedMesh||o instanceof LineSegments){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();if(o instanceof InstancedMesh)o.dispose();}});}
}
