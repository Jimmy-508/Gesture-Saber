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
test('motion crossfades layers with bounded pitch rather than ramping a motor fundamental',()=>{
 const still=soundForSpeed(0),slow=soundForSpeed(2),fast=soundForSpeed(20);
 assert.equal(still.soft,0);assert.equal(still.fast,0);assert.ok(slow.soft>0);assert.ok(fast.fast>slow.fast);assert.equal(still.hum,fast.hum);assert.ok(fast.rate/still.rate<1.04);assert.deepEqual(soundForSpeed(10000),soundForSpeed(24));assert.deepEqual(soundForSpeed(NaN),still);
});
