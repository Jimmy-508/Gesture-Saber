import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GestureGate,extendedFingers} from '../src/gesture.ts';
test('opening and closing require stable evidence; uncertain pose retains state',()=>{
 const g=new GestureGate();assert.equal(g.update(4,1000),false);assert.equal(g.update(4,1050),false);assert.equal(g.update(4,1111),true);
 assert.equal(g.update(0,1130),true);assert.equal(g.update(4,1150),true);
 assert.equal(g.update(2,1180),true);assert.equal(g.update(0,1200),true);assert.equal(g.update(0,1281),false);
});
test('reacquiring a hand cannot instantly activate old state',()=>{
 const g=new GestureGate();g.update(4,1000);g.update(4,1111);assert.equal(g.active,true);assert.equal(g.update(4,1500),false);assert.equal(g.update(4,1611),true);
});
test('finger classification is invariant to rotation and translation',()=>{
 const p=Array.from({length:21},()=>({x:0,y:0,z:0}));
 for(const i of [5,9,13,17]){p[i]={x:i*.01,y:.1,z:0};p[i+1]={x:i*.01,y:.2,z:0};p[i+2]={x:i*.01,y:.3,z:0};p[i+3]={x:i*.01,y:.4,z:0};}
 assert.equal(extendedFingers(p),4);
 assert.equal(extendedFingers(p.map(({x,y,z})=>({x:y+3,y:-x+1,z:z+5}))),4);
 for(const i of [5,9,13,17])p[i+3]={x:i*.01,y:.05,z:0};
 assert.equal(extendedFingers(p),0);
});
