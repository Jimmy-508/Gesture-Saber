import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Quaternion} from 'three';
import {MotionFilter} from '../src/motion.ts';
import {TrailBuffer} from '../src/trail.ts';
import {Metric,ResolutionBudget} from '../src/metrics.ts';
import {synthesize} from '../src/sound-design.ts';
test('mirrored red/blue trajectories produce identical strength, lifetime and independent buffers',()=>{
 const a=new TrailBuffer(),b=new TrailBuffer(),right=new Vector3(1,0,0);
 for(let i=0;i<90;i++){const x=Math.sin(i*.06),z=Math.sin(i*.04)*.2,t=1000+i*1000/60;a.update(new Vector3(x,0,z),new Vector3(x+.4,2.7,z),t,1,.18,right);b.update(new Vector3(-x,0,z),new Vector3(-x-.4,2.7,z),t,1,.18,right);assert.equal(a.vertices,b.vertices);assert.ok(Math.abs(a.energy-b.energy)<1e-10);assert.deepEqual(a.ages,b.ages);}
 assert.ok(a.vertices>0);assert.notEqual(a.positions,b.positions);a.reset();assert.ok(b.vertices>0);
 b.update(new Vector3(),new Vector3(0,2.7,0),5000,0,.18,right);assert.equal(b.vertices,0);
});
test('rotation-only and slow translation generate trails; stationary data ages to zero',()=>{
 const t=new TrailBuffer(),r=new Vector3(1,0,0),b=new Vector3();
 for(let i=0;i<30;i++)t.update(b,new Vector3(Math.sin(i*.015)*2.7,Math.cos(i*.015)*2.7,0),i*16.7,1,.18,r);
 assert.ok(t.vertices>0);assert.ok(t.energy>0);
 t.reset();for(let i=0;i<30;i++)t.update(new Vector3(i*.005,0,0),new Vector3(i*.005,2.7,0),i*16.7,1,.18,r);assert.ok(t.vertices>0,'no fixed .6 speed gate');
 const end=new Vector3(.145,2.7,0);t.update(new Vector3(.145,0,0),end,1000,1,.18,r);assert.equal(t.vertices,0);
});
test('24 Hz samples interpolate on 60 Hz frames; prediction is bounded and stops on stale data',()=>{
 const f=new MotionFilter(),q=new Quaternion();f.push(new Vector3(),q,1000,1010);f.push(new Vector3(.1,0,0),q,1042,1052);
 f.sample(1056);const first=f.position.x;f.sample(1062);assert.ok(f.position.x>first);f.sample(1074);assert.ok(f.position.x<=.22);
 f.sample(1300);const stale=f.position.clone();f.sample(1600);assert.deepEqual(f.position,stale);
 f.push(new Vector3(.1,0,0),q,1601,1601);f.sample(1660);f.sample(2000);assert.ok(f.position.distanceTo(new Vector3(.1,0,0))<1e-9);
});
test('stop cancels extrapolation; gaps and out-of-order packets cannot jump or restart prediction',()=>{
 const f=new MotionFilter(),q=new Quaternion();f.push(new Vector3(),q,0,0);f.push(new Vector3(.4,0,0),q,42,42);f.sample(60);f.push(new Vector3(.4,0,0),q,84,84);f.sample(140);assert.ok(Math.abs(f.position.x-.4)<.02);
 const time=f.lastSample;f.push(new Vector3(99,0,0),q,20,150);assert.equal(f.lastSample,time);f.push(new Vector3(1,0,0),q,1000,1000);assert.equal(f.position.x,1);f.reset();assert.equal(f.speed,0);
});
test('equal input/render cadence advances the previous interpolation instead of freezing every frame',()=>{
 const f=new MotionFilter(),q=new Quaternion();for(let i=0;i<60;i++){const now=i*1000/60;f.push(new Vector3(i*.01,0,0),q,now,now);f.sample(now);}assert.ok(f.position.x>.5);assert.ok(f.position.x<.72);
});
test('metrics expose average, p95 and peak; adaptive resolution has hysteresis and cooldown',()=>{
 const m=new Metric();[10,10,10,50].forEach(x=>m.add(x));assert.equal(m.snapshot().mean,20);assert.equal(m.snapshot().peak,50);
 const b=new ResolutionBudget();assert.equal(b.step(30,1,1000),false);b.step(30,1,2000);assert.equal(b.step(30,1,3000),true);assert.equal(b.scale,.9);assert.equal(b.step(40,4,4000),false);assert.equal(b.scale,.9);b.reset();assert.equal(b.scale,1);
});
test('offline sound assets are deterministic, bounded and loop seam is small',()=>{
 for(const name of ['hum','soft','fast','ignite','retract']){const a=synthesize(name),b=synthesize(name);assert.deepEqual(a,b);assert.ok(a.every(n=>Number.isFinite(n)&&Math.abs(n)<1));if(['hum','soft','fast'].includes(name))assert.ok(Math.abs(a[0]-a.at(-1))<.18);}
});
