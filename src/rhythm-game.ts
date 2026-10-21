import {Group,InstancedMesh,Vector3,BufferGeometry,Float32BufferAttribute,LineBasicMaterial,LineSegments} from 'three';
import type {SaberScene} from './scene.ts';
import {BLADE_LENGTH} from './saber-spec.ts';
import {BladeCollider,type BladeSegment} from './rhythm-collision.ts';
import {ScoreBoard,makeChart,targetZ,HIT_WINDOW,PERFECT_WINDOW,TARGET_RADIUS,type TargetEvent,type MusicAnalysis} from './rhythm-chart.ts';
import type {MusicTransport} from './music.ts';
import {NeonTargets,TARGET_SLOTS} from './neon-targets.ts';
const CAPACITY=TARGET_SLOTS;
const STRIKE_HEIGHT=2*Math.tan(21.5*Math.PI/180)*11;
const segment=():BladeSegment=>({a:new Vector3(),b:new Vector3(),active:false});
/** Bounded CPU/GPU pools; no musical analysis or React updates in this loop. */
export class RhythmGame{
 readonly root=new Group();readonly score=new ScoreBoard();chart:TargetEvent[]=[];active=false;
 private targets=new Array<TargetEvent|null>(CAPACITY).fill(null);private outcome=new Uint8Array(0);private protectedEvents=new Uint8Array(0);private cursor=0;
 readonly visuals:NeonTargets;readonly hitEnds=new Uint32Array(2);private strike:LineSegments;
 private position=new Vector3();private collider=new BladeCollider();private blades=[segment(),segment()];private previous=[segment(),segment()];
 private lastTime=-Infinity;private lastFrame=-Infinity;private serial=-1;private previousValid=false;private safeUntil=-Infinity;private paused=true;private graceUntil=-Infinity;
 hits=0;updates=0;collisionChecks=0;peakTargets=0;
 private scene:SaberScene;private music:MusicTransport;private sound:()=>void;
 constructor(scene:SaberScene,music:MusicTransport,sound:()=>void=()=>{}){
  this.scene=scene;this.music=music;this.sound=sound;
  this.root.name='rhythm-targets';this.visuals=new NeonTargets(this.root);
  const geometry=new BufferGeometry();const vertices:number[]=[];for(const x of [-2.25,2.25])for(const y of [-.2,2.5])vertices.push(x,y+(y<0?.22:-.22),0,x,y,0,x,y,0,x+(x<0?.25:-.25),y,0);geometry.setAttribute('position',new Float32BufferAttribute(vertices,3));this.strike=new LineSegments(geometry,new LineBasicMaterial({color:0x428493,transparent:true,opacity:.55}));this.root.add(this.strike);
  this.reset();this.root.visible=false;scene.scene.add(this.root);scene.onFrame=now=>this.update(now);
 }
 setMusic(analysis:MusicAnalysis|null){this.chart=analysis?makeChart(analysis):[];this.outcome=new Uint8Array(this.chart.length);this.protectedEvents=new Uint8Array(this.chart.length);this.reset();}
 prepare(){const visible=this.root.visible;this.root.visible=true;try{void this.scene.renderer.compileAsync(this.scene.scene,this.scene.camera).catch(()=>{});}finally{this.root.visible=visible;}}
 reset(){this.targets.fill(null);this.outcome.fill(0);this.protectedEvents.fill(0);this.cursor=0;this.score.reset();this.hitEnds.fill(0);this.lastTime=this.lastFrame=-Infinity;this.previousValid=false;this.safeUntil=this.graceUntil=-Infinity;this.hits=this.updates=this.collisionChecks=this.peakTargets=0;this.visuals.reset();}
 start(){this.reset();this.active=true;this.root.visible=true;}
 stop(){this.active=false;this.root.visible=false;this.previousValid=false;this.targets.fill(null);this.visuals.reset();}
 private readBlades(){const w=this.scene.weapon;w.group.updateWorldMatrix(true,true);for(let i=0;i<2;i++){const blade=i===0?w.blade:w.rear,out=this.blades[i];out.active=w.group.visible&&blade.visible&&blade.scale.y>.08;out.a.set(0,0,0).applyMatrix4(blade.matrixWorld);out.b.set(0,BLADE_LENGTH,0).applyMatrix4(blade.matrixWorld);}}
 update(now:number){if(!this.active)return;this.updates++;const time=this.music.gameTime(),running=this.music.running;
  if(!running&&this.music.status!=='ended'){this.previousValid=false;this.paused=true;return;}
  // The existing resume clock has a short audible lead-in. Effects may wait for
  // it to catch up, but must never rewind or retire a freshly cut pair.
  const fxTime=Math.max(time,this.lastTime);
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
  for(let i=0;i<CAPACITY;i++){const event=this.targets[i];if(!event){this.visuals.hide(i);}else{
    count++;const delta=time-event.hitTime;this.position.set(event.x*fit,event.y,targetZ(event,time));
    if(time>=event.hitTime-HIT_WINDOW&&time<=event.hitTime+HIT_WINDOW&&time<=this.graceUntil)this.protectedEvents[event.id]=1;
    let hit=-1;if(fresh&&now>=this.safeUntil&&!this.scene.morph.transitioning&&Math.abs(delta)<=HIT_WINDOW){for(let b=0;b<2;b++){this.collisionChecks++;if(this.collider.touches(this.position,TARGET_RADIUS,this.blades[b],this.previous[b],continuous)){hit=b;break;}}}
    const approach=Math.max(0,Math.min(1,(time-event.spawnTime)/event.travelDuration)),scale=.55+.45*approach,angle=time*.35+event.id;
    if(hit>=0){this.outcome[event.id]=1;this.targets[i]=null;this.score.apply(Math.abs(delta)<=PERFECT_WINDOW?'Perfect':'Good');this.hits++;this.hitEnds[hit]++;this.visuals.split(fxTime,this.position,event.id,scale,angle,this.blades[hit],this.previous[hit],continuous,this.scene.quality==='low'?4:8);this.sound();this.visuals.hide(i);}
    else if(delta>HIT_WINDOW){this.outcome[event.id]=this.protectedEvents[event.id]?3:2;this.targets[i]=null;this.score.apply(this.protectedEvents[event.id]?'Safe':'Miss');this.visuals.hide(i);}
    else this.visuals.target(i,this.position,scale,angle,event.id);
   }
  }
  this.peakTargets=Math.max(this.peakTargets,count);this.visuals.update(fxTime,this.scene.quality==='low');
  for(let i=0;i<2;i++){this.previous[i].a.copy(this.blades[i].a);this.previous[i].b.copy(this.blades[i].b);this.previous[i].active=this.blades[i].active;}
  this.lastTime=fxTime;this.lastFrame=now;this.previousValid=fresh;this.paused=false;
  if(this.music.status==='ended')this.stop();
 }
 get remaining(){return this.chart.length-this.score.perfect-this.score.good-this.score.miss-this.score.safe;}
 dispose(){if(this.scene.onFrame)this.scene.onFrame=null;this.stop();this.scene.scene.remove(this.root);const materials=new Set<import('three').Material>();this.root.traverse(o=>{if(o instanceof InstancedMesh||o instanceof LineSegments){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);if(o instanceof InstancedMesh)o.dispose();}});for(const material of materials)material.dispose();}
}
