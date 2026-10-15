import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BladeState,soundForSpeed,motionSpeed} from '../src/dynamics.ts';
test('left and right extend and retract independently from emitter',()=>{
 const left=new BladeState(),right=new BladeState();left.observe(true,1000);assert.equal(left.step(1000,.08),.5);assert.equal(right.step(1000,.08),0);
 left.observe(true,1080);assert.equal(left.step(1080,.08),1);right.observe(true,1080);assert.equal(right.step(1080,.08),.5);
 left.observe(false,1100);assert.ok(left.step(1100,.06)>.4);assert.equal(right.step(1100,.08),1);assert.equal(left.step(1160,.06),0);
});
test('short tracking loss retains blade; extended loss retracts and reset is immediate',()=>{
 const s=new BladeState();s.observe(true,1000);s.step(1000,.1);s.step(1080,.1);assert.equal(s.step(1200,.02),1);assert.equal(s.active,true);s.step(1300,.06);assert.equal(s.active,false);assert.ok(s.extension>0);s.step(1360,.06);assert.equal(s.extension,0);s.reset();assert.equal(s.extension,0);
});
test('measured motion ignores stale samples and clamps spikes',()=>{assert.equal(motionSpeed(1,.1),10);assert.equal(motionSpeed(100,.01),24);assert.equal(motionSpeed(10,1),0);assert.equal(motionSpeed(10,0),0)});
test('original Phase 1.1 speed-to-pitch/gain/cutoff/wind mapping is restored exactly',async()=>{
 const original=(await import('../benchmarks/phase11-dynamics.ts')).soundForSpeed;
 for(const speed of [0,.1,2,8,24,10000,NaN,Infinity,-5])assert.deepEqual(soundForSpeed(speed),original(speed));
 assert.equal(soundForSpeed(0).pitch,62);assert.ok(soundForSpeed(24).pitch>160);assert.ok(soundForSpeed(24).wind>soundForSpeed(2).wind);
});
