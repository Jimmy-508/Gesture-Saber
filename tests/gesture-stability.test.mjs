import {test} from 'node:test';import assert from 'node:assert/strict';
import {Quaternion,Vector3,Euler} from 'three';import {BladeState} from '../src/dynamics.ts';import {MotionFilter} from '../src/motion.ts';import {TrailBuffer} from '../src/trail.ts';import {HandAssignment} from '../src/hand-assignment.ts';import {anatomicalHand,detections} from './fixtures/anatomical-hands.mjs';
function curled(h){for(const p of [h.world,h.points])for(const i of [5,9,13,17]){const a=p[i],s=p===h.world?1:2;p[i+1]={x:a.x,y:a.y-.035*s,z:a.z+.008*s};p[i+2]={x:a.x+.003*s,y:a.y-.020*s,z:a.z+.030*s};p[i+3]={x:a.x+.004*s,y:a.y+.001*s,z:a.z+.019*s};}return h;}
function feed(a,states,hands,time){for(const {side} of a.assign(detections(hands,time)))states[side].observe(true,time);for(const s of Object.values(states))s.step(time,.02);}
test('open and anatomically curled hands activate immediately; flat, rotated and noisy fast swings never request closing',()=>{
 for(const side of ['Left','Right']){const a=new HandAssignment(),states={Left:new BladeState(),Right:new BladeState()};
 for(let i=0;i<100;i++){let h=anatomicalHand(side,new Quaternion().setFromEuler(new Euler(i/99*Math.PI,.2*Math.sin(i),i*.05)),.5+Math.sin(i*.1)*.1);if(i%2)h=curled(h);h.points=h.points.map((p,k)=>({x:p.x+Math.sin(k+i)*.0006,y:p.y+Math.cos(k+i)*.0006,z:p.z}));feed(a,states,[h],1000+i*42);assert.equal(states[side].active,true);assert.equal(states[side==='Left'?'Right':'Left'].active,false);}
 }
});
test('presence invalidity, rather than palm quality or score, rejects observations',()=>{for(const landmarks of [[],[Array(21).fill({x:NaN,y:NaN,z:NaN})],[Array(21).fill({x:.5,y:.5,z:0})]])assert.equal(new HandAssignment().assign({landmarks,handedness:[],time:1000}).length,0);const h=anatomicalHand('Right');h.points[9].z=NaN;assert.equal(new HandAssignment().assign(detections([h],1000)).length,1);});
test('short loss holds activation; sustained loss retracts and hides; independently reacquired fist immediately extends',()=>{
 const l=new BladeState(),r=new BladeState();l.observe(true,1000);r.observe(true,1000);l.step(1000,.1);l.step(1080,.1);l.markLost('遮擋');l.step(1100,.02);assert.equal(l.active,true);l.observe(true,1120);l.step(1120,.02);assert.equal(l.extension,1);
 l.markLost('持續遮擋');for(let t=1140;t<=1600;t+=20){l.step(t,.02);r.observe(true,t);r.step(t,.02);}assert.equal(l.visible(1600),false);assert.equal(l.extension,0);assert.equal(r.active,true);assert.match(l.diagnostics(1600),/LOST.*隱藏/);
 l.observe(true,1620);assert.ok(l.step(1620,.02)>0);assert.equal(l.active,true);l.reset();assert.equal(l.active,false);assert.equal(l.lastSeen,-Infinity);
});
test('crossing, result-order reversal, duplicate labels, occlusion and reacquisition preserve bilateral ownership',()=>{
 const a=new HandAssignment(),states={Left:new BladeState(),Right:new BladeState()};for(let i=0;i<=10;i++){const hands=[anatomicalHand('Left',new Quaternion(),.7-i*.04),anatomicalHand('Right',new Quaternion(),.3+i*.04)];if(i%2)hands.reverse();for(const assignment of a.assign(detections(hands,1000+i*40))){if(!assignment.freeze)assert.equal(assignment.side,hands[assignment.index].side);states[assignment.side].observe(true,1000+i*40);}for(const s of Object.values(states))s.step(1000+i*40,.04);}
 assert.equal(states.Left.active,true);assert.equal(states.Right.active,true);assert.equal(a.assign(detections([],1450)).length,0);assert.equal(a.assign(detections([anatomicalHand('Left',new Quaternion(),.3),anatomicalHand('Right',new Quaternion(),.7)],1500)).length,2);
});
test('loss freezes displayed pose and prediction, recovery interpolates; trails age without new loss samples',()=>{
 const m=new MotionFilter(),q=new Quaternion();m.push(new Vector3(),q,1000,1000);m.push(new Vector3(.2,0,0),q,1042,1042);m.sample(1055);m.freeze();const held=m.position.clone();m.sample(1150);assert.ok(m.position.distanceTo(held)<1e-9);m.push(new Vector3(.3,0,0),q,1400,1400);assert.ok(m.position.distanceTo(held)<1e-9);m.sample(1435);assert.ok(m.position.x>.25);
 const trail=new TrailBuffer(),right=new Vector3(1,0,0);trail.update(new Vector3(),new Vector3(0,3,0),1000,1,.18,right);trail.update(new Vector3(.1,0,0),new Vector3(.1,3,0),1020,1,.18,right);assert.ok(trail.vertices>0);trail.update(new Vector3(1,0,0),new Vector3(1,3,0),1250,1,.18,right,false);assert.equal(trail.vertices,0);
});
test('out of order observations cannot refresh the tracking timeout',()=>{const s=new BladeState();s.observe(true,1000);s.observe(true,900);assert.equal(s.lastSeen,1000);s.step(1300,.1);assert.equal(s.active,false);});
