import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SaberAudio} from '../src/audio.ts';
class Param{value=0;targets=[];cancelScheduledValues(){}setTargetAtTime(v){this.targets.push(v);this.value=v}setValueAtTime(v){this.value=v}exponentialRampToValueAtTime(v){this.value=v}}
class Node{frequency=new Param();gain=new Param();Q=new Param();pan=new Param();starts=0;stops=0;disconnected=false;connect(){}disconnect(){this.disconnected=true}start(){this.starts++}stop(){this.stops++}}
class Context{
 static current;nodes=[];sampleRate=100;currentTime=1;state='suspended';destination={};closed=0;constructor(){Context.current=this}node(){const n=new Node();this.nodes.push(n);return n}createGain(){return this.node()}createOscillator(){return this.node()}createBiquadFilter(){return this.node()}createStereoPanner(){return this.node()}createBufferSource(){return this.node()}createBuffer(){return {getChannelData:()=>new Float32Array(200)}}async resume(){this.state='running'}async close(){this.closed++;this.state='closed'}
}
test('audio unlock creates two continuous voices; movement never creates more sources; stop and dispose release resources',async()=>{
 globalThis.window={AudioContext:Context};const audio=new SaberAudio();await audio.unlock();const ctx=Context.current,sources=ctx.nodes.filter(n=>n.starts);assert.equal(sources.length,8);
 const count=ctx.nodes.length;audio.update('Left',true,0,1);const right=audio.voices.Right;assert.equal(right.active,false);audio.update('Right',true,20,1);assert.equal(right.active,true);
 for(let i=0;i<300;i++)audio.update('Left',true,i%20,1);assert.equal(ctx.nodes.length,count);assert.equal(audio.voices.Left.active,true);
 audio.update('Left',false,0,.5);assert.equal(audio.voices.Left.active,false);assert.equal(right.active,true);
 audio.configure(false,.4);assert.equal(audio.master.gain.value,0);audio.stop();assert.equal(right.active,false);assert.equal(right.hum.gain.value,0);assert.equal(right.wind.gain.value,0);
 audio.dispose();audio.dispose();assert.equal(ctx.closed,1);for(const source of sources)assert.equal(source.stops,1);assert.ok(ctx.nodes.every(n=>n.disconnected));
});
test('muted audio does not initialize or resume context',async()=>{globalThis.window={AudioContext:Context};const audio=new SaberAudio();audio.configure(false,.2);await audio.unlock();assert.equal(audio.context,null);audio.dispose()});
