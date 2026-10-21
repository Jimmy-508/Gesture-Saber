import {test} from 'node:test';import assert from 'node:assert/strict';import {Group,Vector3,Matrix4} from 'three';
import {RhythmGame} from '../src/rhythm-game.ts';import {NeonTargets,targetGeometry,CUT_SLOTS,CUT_LIFE,SPARKS} from '../src/neon-targets.ts';import {writeImpact} from '../src/impact-audio.ts';
const blade=(x=0,y=0)=>({a:new Vector3(x,y,0),b:new Vector3(x,y+2,0),active:true});
function setup(end='front'){
 const root=new Group(),group=new Group(),front=new Group(),rear=new Group();front.position.y=.12;rear.position.y=-.96;rear.rotation.z=Math.PI;group.add(front,rear);root.add(group);rear.visible=end!=='single';let time=0,now=1000,sounds=0;
 const clock={running:true,status:'playing',gameTime:()=>time},scene={scene:root,weapon:{group,blade:front,rear,state:{canMove:true}},control:{serial:0,hand:{lastSeen:now}},quality:'medium',demo:false,morph:{transitioning:false}};
 const g=new RhythmGame(scene,clock,()=>sounds++);g.setMusic({duration:6,confidence:1,events:[{time:3,strength:1,confidence:1}],sections:[]});g.chart[0].x=0;g.chart[0].y=end==='rear'?-2:1.4;g.start();
 return {g,scene,clock,group,front,rear,sounds:()=>sounds,set(t,dt=20){time=t;now+=dt;scene.control.hand.lastSeen=now;g.update(now);}};
}
test('closed pre-cut halves have real thickness and an emissive cut face, not just disappearing particles',()=>{
 const g=targetGeometry(true),p=g.getAttribute('position'),cut=g.getAttribute('cut');let cap=0;for(let i=0;i<p.count;i++){assert.ok(p.getX(i)>=-1e-6);assert.ok(Math.abs(p.getZ(i))<=.14001);if(cut.getX(i)){assert.ok(Math.abs(p.getX(i))<1e-6);cap++;}}assert.ok(cap>=6);assert.ok(g.boundingSphere.radius>.3);g.dispose();
});
test('single/front/rear direct strikes share one split, flash, sparks, sound and judgement; each target scores once',()=>{
 for(const end of ['single','front','rear']){const f=setup(end);try{f.set(2.7,100);f.set(3,100);assert.equal(f.g.hits,1);assert.equal(f.g.visuals.cutsCreated,1);assert.equal(f.g.visuals.liveCuts,1);assert.equal(f.g.visuals.liveSparks,8);assert.equal(f.sounds(),1);assert.equal(f.g.score.perfect,1);assert.equal(f.g.hitEnds[end==='rear'?1:0],1);f.set(3.05);assert.equal(f.g.hits,1);assert.equal(f.g.visuals.cutsCreated,1);}finally{f.g.dispose();}}
});
test('both end sweeps cut even when neither final segment directly touches; simultaneous overlap still splits once',()=>{
 for(const end of ['front','rear']){const f=setup(end);try{f.group.position.x=-.65;f.set(2.75,100);f.set(2.9,80);f.set(2.94);f.group.position.x=.65;f.set(3);assert.equal(f.g.hits,1,end);assert.equal(f.g.hitEnds[end==='rear'?1:0],1);assert.equal(f.g.visuals.cutsCreated,1);}finally{f.g.dispose();}}
 const f=setup('front');try{f.rear.position.copy(f.front.position);f.rear.rotation.set(0,0,0);f.set(2.7,100);f.set(3,100);assert.equal(f.g.hits,1);assert.equal(f.sounds(),1);assert.equal(f.g.visuals.cutsCreated,1);}finally{f.g.dispose();}
});
test('halves separate along the selected cut normal; song pause preserves all matrices, resume/restart and departure recycle',()=>{
 const f=setup();try{f.set(2.7,100);f.set(3,100);const a=new Matrix4(),b=new Matrix4();f.g.visuals.halves.getMatrixAt(0,a);f.g.visuals.halves.getMatrixAt(1,b);const initial=new Vector3().setFromMatrixPosition(a).distanceTo(new Vector3().setFromMatrixPosition(b));f.set(3.12);f.g.visuals.halves.getMatrixAt(0,a);f.g.visuals.halves.getMatrixAt(1,b);assert.ok(new Vector3().setFromMatrixPosition(a).distanceTo(new Vector3().setFromMatrixPosition(b))>initial+.3);
  const matrices=f.g.visuals.meshes.map(m=>Array.from(m.instanceMatrix.array));f.clock.running=false;f.clock.status='paused';f.set(3.5);for(const [i,m]of f.g.visuals.meshes.entries())assert.deepEqual(Array.from(m.instanceMatrix.array),matrices[i]);f.clock.running=true;f.clock.status='playing';f.set(3.7);assert.equal(f.g.visuals.liveCuts,0);assert.equal(f.g.visuals.liveSparks,0);f.g.start();assert.equal(f.g.score.score,0);assert.equal(f.g.visuals.cutsCreated,0);f.g.stop();assert.equal(f.g.root.visible,false);
 }finally{f.g.dispose();}
});
test('fixed effect pool under repeated burst load reuses geometry, limits live halves/sparks and expires; low quality keeps halves',()=>{
 const root=new Group(),v=new NeonTargets(root),ids=v.meshes.map(m=>m.geometry.uuid),p=new Vector3(),previous=blade(-.5),current=blade(.5);for(let i=0;i<200;i++)v.split(1,p,i,1,0,current,previous,true);v.update(1.2,true);assert.equal(v.liveCuts,CUT_SLOTS);assert.ok(v.liveSparks<=SPARKS);assert.equal(v.halves.count,CUT_SLOTS*2);assert.equal(v.halos.visible,false);assert.ok(v.halves.visible);assert.ok(Math.abs(v.cutNormal.dot(new Vector3(0,-1,0)))>.9);assert.deepEqual(v.meshes.map(m=>m.geometry.uuid),ids);v.update(1+CUT_LIFE+.01);assert.equal(v.liveCuts,0);assert.equal(v.liveSparks,0);v.reset();assert.equal(v.cutsCreated,0);for(const m of v.meshes){m.geometry.dispose();m.material.dispose();m.dispose();}
});
test('new energy-shear buffer is deterministic, short, peak bounded and decays to silence',()=>{
 const a=new Float32Array(48000*.18),b=new Float32Array(a.length);writeImpact(a,48000);writeImpact(b,48000);assert.deepEqual(a,b);let peak=0,early=0,late=0;for(let i=0;i<a.length;i++){assert.ok(Number.isFinite(a[i]));peak=Math.max(peak,Math.abs(a[i]));if(i<2400)early+=a[i]**2;else if(i>a.length-2400)late+=a[i]**2;}assert.ok(peak>.6&&peak<=.720001);assert.ok(late<early*.02);assert.equal(a[0],0);assert.equal(a.at(-1),0);
});
test('the existing 80ms resume lead-in cannot rewind or delete a newly split pair',()=>{
 const f=setup();try{f.set(2.7,100);f.set(3,100);f.set(3.04);const matrices=Array.from(f.g.visuals.halves.instanceMatrix.array);f.clock.running=false;f.clock.status='paused';f.set(3.04);f.clock.running=true;f.clock.status='playing';f.set(2.96);assert.equal(f.g.visuals.liveCuts,1);assert.deepEqual(Array.from(f.g.visuals.halves.instanceMatrix.array),matrices);f.set(3.05);assert.notDeepEqual(Array.from(f.g.visuals.halves.instanceMatrix.array),matrices);}finally{f.g.dispose();}
});
test('front and rear can cut two distinct targets in one update, while each outcome stays singular',()=>{
 const f=setup();try{f.g.setMusic({duration:7,confidence:1,events:[{time:3,strength:1,confidence:1},{time:3.8,strength:1,confidence:1}],sections:[]});for(const [i,e]of f.g.chart.entries()){e.x=0;e.y=i===0?1.4:-2;e.hitTime=3;e.spawnTime=1.35;}f.g.start();f.set(2.7,100);f.set(3,100);assert.equal(f.g.score.score,200);assert.deepEqual(Array.from(f.g.hitEnds),[1,1]);assert.equal(f.g.visuals.cutsCreated,2);assert.equal(f.g.visuals.liveCuts,2);assert.equal(f.sounds(),2);f.set(3.02);assert.equal(f.g.score.score,200);assert.equal(f.g.visuals.cutsCreated,2);}finally{f.g.dispose();}
});
