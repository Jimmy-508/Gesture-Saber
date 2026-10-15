import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SaberAudio} from '../src/audio.ts';
class Param{value=0;targets=[];cancelScheduledValues(){}setTargetAtTime(v){this.targets.push(v);this.value=v}}
class Node{gain=new Param();pan=new Param();starts=0;stops=0;disconnected=false;loop=false;connect(){}disconnect(){this.disconnected=true}start(){this.starts++}stop(){this.stops++}}
class Context{static current;nodes=[];sampleRate=24000;currentTime=1;state='suspended';destination={};closed=0;decodes=0;constructor(){Context.current=this}node(){const n=new Node();this.nodes.push(n);return n}createGain(){return this.node()}createStereoPanner(){return this.node()}createBufferSource(){return this.node()}async decodeAudioData(){this.decodes++;return {duration:3}}async resume(){this.state='running'}async close(){this.closed++;this.state='closed'}}
function setup(){globalThis.window={AudioContext:Context};globalThis.location={origin:'https://test.example'};globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(44)});}
test('six continuous buffer sources; no sources created by 300 movement updates; independent ignition and disposal',async()=>{
 setup();const a=new SaberAudio();await a.unlock();const ctx=Context.current;assert.equal(ctx.nodes.filter(n=>n.loop&&n.starts).length,6);assert.equal(ctx.decodes,5);
 a.update('Left',true,0,1);const right=a.voices.Right;assert.equal(right.active,false);a.update('Right',true,18,1);assert.equal(right.active,true);
 const count=ctx.nodes.length;for(let i=0;i<300;i++){ctx.currentTime+=1/60;a.update('Left',true,i%24,1);}assert.equal(ctx.nodes.length,count);assert.ok(a.parameterWrites<=3*151+6);
 a.update('Left',false,0,.5);assert.equal(a.voices.Left.active,false);assert.equal(right.active,true);
 a.configure(false,.4);assert.equal(a.master.gain.value,0);a.stop();for(const v of Object.values(a.voices))for(const g of v.gains)assert.equal(g.gain.value,0);
 a.dispose();a.dispose();assert.equal(ctx.closed,1);assert.ok(ctx.nodes.every(n=>n.disconnected));for(const source of ctx.nodes.filter(n=>n.starts))assert.equal(source.stops,1);
 const b=new SaberAudio();await b.unlock();assert.equal(Context.current.decodes,0,'completed buffers are reused across sessions');b.dispose();
});
test('muted instance does not initialize audio; late preload is discarded on disposal',async()=>{
 setup();const muted=new SaberAudio();muted.configure(false,.2);await muted.unlock();assert.equal(muted.context,null);muted.dispose();
 class OtherContext extends Context{sampleRate=32000}window.AudioContext=OtherContext;
 globalThis.fetch=(_,options)=>new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')),{once:true}));const a=new SaberAudio();const pending=a.unlock();a.dispose();await pending;
 assert.equal(a.context,null);assert.equal(a.abort.signal.aborted,true);
});
