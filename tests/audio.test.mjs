import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SaberAudio} from '../src/audio.ts';
import {SaberAudio as Phase11Audio} from '../benchmarks/phase11-audio.ts';
class Param {value=0;events=[];cancelScheduledValues(t){this.events.push(['cancel',t])}setTargetAtTime(v,t,c){this.value=v;this.events.push(['target',v,t,c])}setValueAtTime(v,t){this.value=v;this.events.push(['set',v,t])}exponentialRampToValueAtTime(v,t){this.value=v;this.events.push(['ramp',v,t])}}
class Node {frequency=new Param();gain=new Param();Q=new Param();pan=new Param();type='';connections=[];starts=0;stops=0;disconnected=false;connect(n){this.connections.push(n.id??'destination')}disconnect(){this.disconnected=true}start(){this.starts++}stop(){this.stops++}}
class Context {static current;nodes=[];sampleRate=24000;currentTime=1;state='suspended';destination={};closed=0;buffers=0;constructor(){Context.current=this}node(kind){const n=new Node();n.kind=kind;n.id=this.nodes.length;this.nodes.push(n);return n}createGain(){return this.node('gain')}createStereoPanner(){return this.node('pan')}createOscillator(){return this.node('osc')}createBiquadFilter(){return this.node('filter')}createBufferSource(){return this.node('buffer')}createBuffer(_,length){this.buffers++;const samples=new Float32Array(length);return {getChannelData:()=>samples}}async resume(){this.state='running'}async close(){this.closed++;this.state='closed'}}
function setup(){globalThis.window={AudioContext:Context};globalThis.fetch=()=>assert.fail('Phase 1.1 audio does not download/decode sound assets');}
function seeded(){let seed=123;return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
function snapshot(ctx){return ctx.nodes.map(n=>({kind:n.kind,type:n.type,connections:n.connections,frequency:n.frequency,Q:n.Q,gain:n.gain,pan:n.pan,loop:n.loop,noise:n.buffer?[...n.buffer.getChannelData(0).slice(0,32)]:undefined}));}
async function trace(Version){setup();const saved=Math.random;Math.random=seeded();const audio=new Version();try{await audio.unlock();}finally{Math.random=saved;}const ctx=Context.current;
 for(const [time,side,on,speed,extension] of [[1,'Left',true,0,.5],[1.1,'Right',true,2,1],[1.2,'Left',true,24,1],[1.3,'Right',false,0,.4],[1.4,'Left',false,0,0]]){ctx.currentTime=time;audio.update(side,on,speed,extension);}audio.configure(false,.4);audio.stop();const result=snapshot(ctx);audio.dispose();return result;}
test('restored graph, noise, oscillator/filter settings, ignition/retraction envelopes and speed automation exactly match Phase 1.1',async()=>{assert.deepEqual(await trace(SaberAudio),await trace(Phase11Audio));});
test('independent voices reuse all eight sources across motion and transitions; disposal closes everything exactly once',async()=>{
 setup();const a=new SaberAudio();await a.unlock();const ctx=Context.current,count=ctx.nodes.length;assert.equal(ctx.nodes.filter(n=>n.starts).length,8);assert.equal(ctx.buffers,2);
 a.update('Left',true,0,1);assert.equal(a.voices.Left.active,true);assert.equal(a.voices.Right.active,false);a.update('Right',true,24,1);a.update('Left',false,0,0);assert.equal(a.voices.Right.active,true);
 for(let i=0;i<600;i++){ctx.currentTime+=1/60;a.update('Left',i%120<60,i%25,1);}assert.equal(ctx.nodes.length,count);assert.equal(ctx.buffers,2);
 a.configure(false,.8);assert.equal(a.master.gain.value,0);a.stop();for(const v of Object.values(a.voices))for(const g of [v.hum,v.wind,v.transient])assert.equal(g.gain.value,0);
 a.dispose();a.dispose();assert.equal(ctx.closed,1);assert.ok(ctx.nodes.every(n=>n.disconnected));for(const n of ctx.nodes.filter(n=>n.starts))assert.equal(n.stops,1);
 const b=new SaberAudio();await b.unlock();assert.equal(Context.current.nodes.filter(n=>n.starts).length,8);b.dispose();
});
test('mute skips context creation; disposed instance cannot be revived by a late Safari resume',async()=>{
 setup();const muted=new SaberAudio();muted.configure(false,.2);await muted.unlock();assert.equal(muted.context,null);muted.dispose();
 let resume;class Delayed extends Context {resume(){return new Promise(r=>resume=r)}}window.AudioContext=Delayed;
 const a=new SaberAudio(),pending=a.unlock();a.dispose();resume();await pending;assert.equal(a.context,null);assert.equal(Context.current.closed,1);assert.notEqual(a.status,'已啟用');await a.unlock();assert.equal(a.context,null);
});


test('tracking-driven ignition, short occlusion, departure and reacquisition trigger only actual state edges in original audio',async()=>{
 const {BladeState}=await import('../src/dynamics.ts');setup();const audio=new SaberAudio();await audio.unlock();const ctx=Context.current,s=new BladeState();const sweep=audio.voices.Left.sweep.frequency;
 const frame=t=>{ctx.currentTime=t/1000;const extension=s.step(t,.02);audio.update('Left',s.active,0,extension);};
 s.observe(true,1000);frame(1000);for(let t=1020;t<=1100;t+=20){s.observe(true,t);frame(t);}s.markLost('short');frame(1160);s.observe(true,1200);frame(1200);
 assert.equal(sweep.events.filter(e=>e[0]==='ramp').length,1);assert.equal(audio.voices.Right.active,false);
 s.markLost('long');for(let t=1220;t<=1660;t+=20)frame(t);assert.equal(sweep.events.filter(e=>e[0]==='ramp').length,2);
 s.observe(true,1700);frame(1700);assert.equal(sweep.events.filter(e=>e[0]==='ramp').length,3);assert.equal(ctx.buffers,2);audio.dispose();assert.equal(ctx.closed,1);
});

test('unchanged original targets reuse scheduling and sources; transitions and changed values still automate',async()=>{setup();const a=new SaberAudio();await a.unlock();const ctx=Context.current;a.update('Left',true,8,1);ctx.currentTime+=1.1;a.update('Left',true,8,1);const calls=a.scheduledCalls,nodes=ctx.nodes.length;for(let i=0;i<120;i++){ctx.currentTime+=1/60;a.update('Left',true,8,1);}assert.equal(a.scheduledCalls,calls);assert.equal(a.skippedUpdates,121);a.update('Left',true,9,1);assert.ok(a.scheduledCalls>calls);assert.equal(ctx.nodes.length,nodes);assert.equal(ctx.buffers,2);await a.unlock();assert.equal(ctx.nodes.length,nodes);a.stop();a.update('Left',true,9,1);assert.equal(a.voices.Left.active,true);a.dispose();});
