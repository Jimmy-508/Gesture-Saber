import type {Side} from '../src/gesture';
import {soundForSpeed} from '../src/dynamics.ts';
type Voice={osc:OscillatorNode;harmonic:OscillatorNode;sweep:OscillatorNode;noise:AudioBufferSourceNode;filter:BiquadFilterNode;windFilter:BiquadFilterNode;hum:GainNode;wind:GainNode;transient:GainNode;pan:StereoPannerNode;active:boolean;nodes:AudioNode[]};
export class SaberAudio {
 private context:AudioContext|null=null;private master:GainNode|null=null;private voices:Partial<Record<Side,Voice>>={};
 enabled=true;volume=.3;status='等待操作啟用';private disposed=false;
 async unlock(){
  if(this.disposed||!this.enabled)return;
  try{
   if(!this.context){
    const Context=window.AudioContext||(window as unknown as {webkitAudioContext:typeof AudioContext}).webkitAudioContext;
    if(!Context)throw Error('Web Audio 不受支援');
    const ctx=new Context();this.context=ctx;this.master=ctx.createGain();this.master.gain.value=this.volume;this.master.connect(ctx.destination);
    this.voices.Left=this.createVoice(ctx,-.45);this.voices.Right=this.createVoice(ctx,.45);
   }
   await this.context.resume();if(this.disposed)return;this.status=this.context.state==='running'?'已啟用':'音訊暫停，點擊音效開關恢復';
  }catch(e){if(!this.disposed)this.status='音訊無法啟用：'+String(e);}
 }
 private createVoice(ctx:AudioContext,pan:number):Voice{
  const osc=ctx.createOscillator(),harmonic=ctx.createOscillator(),sweep=ctx.createOscillator();osc.type='sawtooth';harmonic.type='triangle';sweep.type='sine';
  osc.frequency.value=66;harmonic.frequency.value=132;sweep.frequency.value=100;
  const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.Q.value=1.1;
  const windFilter=ctx.createBiquadFilter();windFilter.type='bandpass';windFilter.Q.value=.7;
  const hum=ctx.createGain(),wind=ctx.createGain(),transient=ctx.createGain();hum.gain.value=wind.gain.value=transient.gain.value=0;
  const panner=ctx.createStereoPanner();panner.pan.value=pan;
  const noise=ctx.createBufferSource(),buffer=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),samples=buffer.getChannelData(0);
  let previous=0;for(let i=0;i<samples.length;i++){previous=previous*.7+(Math.random()*2-1)*.3;samples[i]=previous;}
  noise.buffer=buffer;noise.loop=true;
  osc.connect(filter);harmonic.connect(filter);filter.connect(hum);hum.connect(panner);noise.connect(windFilter);windFilter.connect(wind);wind.connect(panner);sweep.connect(transient);transient.connect(panner);panner.connect(this.master!);
  osc.start();harmonic.start();sweep.start();noise.start();
  return {osc,harmonic,sweep,noise,filter,windFilter,hum,wind,transient,pan:panner,active:false,nodes:[osc,harmonic,sweep,noise,filter,windFilter,hum,wind,transient,panner]};
 }
 private target(p:AudioParam,value:number,time:number,constant=.045){p.cancelScheduledValues(time);p.setTargetAtTime(value,time,constant);}
 update(side:Side,active:boolean,speed:number,extension:number){
  const ctx=this.context,v=this.voices[side];if(!ctx||!v||ctx.state!=='running')return;
  const now=ctx.currentTime,on=active&&this.enabled;
  if(on!==v.active){
   v.active=on;
   v.sweep.frequency.cancelScheduledValues(now);v.sweep.frequency.setValueAtTime(on?80:550,now);v.sweep.frequency.exponentialRampToValueAtTime(on?580:45,now+(on?.16:.12));
   v.transient.gain.cancelScheduledValues(now);v.transient.gain.setValueAtTime(this.enabled?.065:0,now);v.transient.gain.exponentialRampToValueAtTime(.0001,now+.2);
  }
  const motion=soundForSpeed(speed),gain=this.enabled?extension:0;
  this.target(v.osc.frequency,motion.pitch*(side==='Left'?1:1.07),now);this.target(v.harmonic.frequency,motion.pitch*2.012,now);
  this.target(v.filter.frequency,motion.cutoff,now);this.target(v.windFilter.frequency,500+motion.cutoff,now);
  this.target(v.hum.gain,motion.gain*gain,now,.025);this.target(v.wind.gain,motion.wind*gain,now,.035);
 }
 configure(enabled:boolean,volume:number){this.enabled=enabled;this.volume=Math.max(0,Math.min(1,volume));if(this.master&&this.context)this.target(this.master.gain,enabled?this.volume:0,this.context.currentTime,.03);if(!enabled)this.status='已靜音';}
 stop(){
  const ctx=this.context;if(!ctx)return;
  for(const v of Object.values(this.voices)){v.active=false;for(const gain of [v.hum,v.wind,v.transient])this.target(gain.gain,0,ctx.currentTime,.012);}
  // Keep the context unlockable from the next user gesture; no background sound.
  this.status=this.enabled?'待命':'已靜音';
 }
 dispose(){
  if(this.disposed)return;this.disposed=true;this.stop();
  for(const v of Object.values(this.voices)){for(const source of [v.osc,v.harmonic,v.sweep,v.noise])source.stop();for(const node of v.nodes)node.disconnect();}
  this.master?.disconnect();void this.context?.close().catch(()=>{});this.voices={};this.context=null;this.master=null;
 }
}
