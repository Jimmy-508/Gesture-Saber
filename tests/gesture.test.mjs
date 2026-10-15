import {test} from 'node:test';import assert from 'node:assert/strict';
import {reliablePalm} from '../src/gesture.ts';import {Quaternion,Vector3} from 'three';import {anatomicalHand} from './fixtures/anatomical-hands.mjs';
test('reliable palm uses 3D MCP and wrist only: curled/occluded fingers and edge-on poses remain usable',()=>{
 for(const side of ['Left','Right'])for(const angle of [0,Math.PI/2,Math.PI]){const h=anatomicalHand(side,new Quaternion().setFromAxisAngle(new Vector3(1,0,0),angle));for(const i of [1,2,3,4,6,7,8,10,11,12,14,15,16,18,19,20])h.points[i]={x:NaN,y:NaN,z:NaN};assert.equal(reliablePalm(h.points),true);}
 const h=anatomicalHand('Left');h.points[9]={x:NaN,y:0,z:0};assert.equal(reliablePalm(h.points),true);assert.equal(reliablePalm([]),false);assert.equal(reliablePalm(Array(21).fill({x:0,y:0,z:0})),false);
});
