import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {WeaponControl} from '../src/weapon-control.ts';
import {TwinGesture} from '../src/twin-gesture.ts';import {TRACKING} from '../src/tracking-state.ts';
import {BladeState} from '../src/dynamics.ts';
import {toggleCases,togglePackets,presenceCases,presencePackets} from './fixtures/pairing-cases.mjs';
import {commandHand,input} from './fixtures/twin-hands.mjs';

test('distinct curled hands tolerate low/flipped labels, two occluded fingers, hidden tips and natural approach without gating pose',()=>{
 for(const c of toggleCases){const w=new WeaponControl();for(const d of togglePackets(c))w.observe(d,d.time+24,1.6);assert.equal(w.mode.changes,c.positive?1:0,c.name);assert.equal(w.primary,'Left',c.name);}
});
test('noisy single hand remains owned through low/flipped labels at reversal; partial palm and open fingers retain presence independently of direction',()=>{
 for(const name of presenceCases.filter(n=>!['true zero','secondary only'].includes(n)))for(const side of ['Left','Right']){
  const w=new WeaponControl(),state=new BladeState();let accepted=0,last=-Infinity;
  for(const d of presencePackets(name,side)){const r=w.observe(d,d.time+24,1.6);if(r?.match&&!r.match.freeze){state.observe(true,d.time+24);last=d.time+24;accepted++;}state.step(d.time+40,.016);w.sample(d.time+40);assert.equal(w.primary,side,name);assert.ok(state.visible(d.time+40),name);if(!d.landmarks.length)assert.equal(w.lastSeen,last);assert.ok(w.hand.position.toArray().concat(w.hand.rotation.toArray()).every(Number.isFinite));}
  assert.equal(w.serial,0,name);assert.ok(accepted>=19,name);assert.equal(w.singleOn,true,name);
 }
});
test('secondary-only observations cannot renew the original owner; true zero still retracts at260 and expires at420',()=>{
 for(const name of ['secondary only','true zero'])for(const side of ['Left','Right']){
  const w=new WeaponControl(),d=presencePackets(name,side),state=new BladeState();for(const p of d.slice(0,4)){w.observe(p,p.time+24,1.6);state.observe(true,p.time+24);}const last=w.lastSeen;
  for(const p of d.slice(4).filter(p=>p.time+24<last+420)){w.observe(p,p.time+24,1.6);assert.equal(w.lastSeen,last);assert.equal(w.primary,side);}
  state.step(last+259,.016);assert.equal(state.active,true);state.step(last+260,.016);assert.equal(state.active,false);assert.equal(state.visible(last+420),false);assert.equal(w.advance(last+420),true);assert.equal(w.primary,null);
 }
 assert.deepEqual(TRACKING,{staleMs:180,retractMs:260,hideMs:420});
});
test('pose ambiguity may toggle but cannot update the accepted pose timestamp or transfer ownership',()=>{
 const c=toggleCases.find(c=>c.ambiguous),w=new WeaponControl();for(const d of togglePackets(c)){const r=w.observe(d,d.time+24,1.6);if(d.time>1000){assert.equal(r.match.freeze,true);assert.equal(r.match.present,true);assert.equal(w.lastSeen,d.time+24);assert.equal(w.hand.lastSeen,1024);}}
 assert.equal(w.mode.twin,true);assert.equal(w.primary,'Left');assert.equal(w.advance(w.lastSeen+420),true);
});
test('holding join and UNKNOWN cannot rearm; a real release then new hold toggles exactly once again',()=>{
 const g=new TwinGesture(),e=kind=>({kind,absent:false,reason:'QA'});for(let t=1000;t<2000;t+=42)g.update(e('JOIN'),t);assert.equal(g.changes,1);
 for(let t=2008;t<2250;t+=42)g.update(e('UNKNOWN'),t);for(let t=2260;t<2500;t+=42)g.update(e('JOIN'),t);assert.equal(g.changes,1);
 for(let t=2510;t<2760;t+=42)g.update(e('RELEASE'),t);for(let t=2770;t<3050;t+=42)g.update(e('JOIN'),t);assert.equal(g.changes,2);assert.equal(g.twin,false);
});
test('two close real observations maintain presence through an extended pose ambiguity; one duplicated or missing hand cannot',()=>{
 const w=new WeaponControl(),c=toggleCases.find(c=>c.ambiguous),packets=togglePackets({...c,times:Array.from({length:20},(_,i)=>i*42)});
 for(const d of packets)w.observe(d,d.time+24,1.6);
 assert.equal(w.serial,0);assert.equal(w.primary,'Left');assert.equal(w.hand.lastSeen,1024);assert.equal(w.mode.changes,1);
 const last=w.lastSeen;w.observe(input([],last+42),last+66,1.6);assert.equal(w.lastSeen,last);assert.equal(w.advance(last+420),true);
});
test('unrelated large jump, a new hand without initial label evidence, single duplicates and stale timestamps remain protected',()=>{
 const w=new WeaponControl();w.observe(input([commandHand('Left',{fist:true,x:.1})],1000),1024,1.6);const serial=w.serial;
 assert.equal(w.observe(input([commandHand('Right',{x:.9})],1042),1066,1.6).match,null);assert.equal(w.lastSeen,1024);assert.equal(w.serial,serial);
 assert.equal(w.observe(input([commandHand('Left')],999),1100,1.6),null);
 const unowned=new WeaponControl(),d=input([commandHand('Right')],1000);d.handedness=[[]];assert.equal(unowned.observe(d,1024,1.6).match,null);assert.equal(unowned.primary,null);
});
test('accepted Grip geometry, audio, camera, caches, smoothing and transformation source remain byte-identical to release baseline',()=>{
 const fixture=JSON.parse(fs.readFileSync('tests/fixtures/protected-source-sha256.json','utf8'));for(const [file,expected] of Object.entries(fixture.hashes)){const current=fs.readFileSync('src/'+file,'utf8').replaceAll('\r\n','\n');assert.equal(createHash('sha256').update(current).digest('hex'),expected,file);}
});
