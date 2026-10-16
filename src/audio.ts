import type {Side} from './gesture';
import {soundForSpeed} from './dynamics.ts';
type Voice={osc:OscillatorNode;harmonic:OscillatorNode;sweep:OscillatorNode;noise:AudioBufferSourceNode;filter:BiquadFilterNode;windFilter:BiquadFilterNode;hum:GainNode;wind:GainNode;transient:GainNode;pan:StereoPannerNode;stableSince?:number;lastSpeed?:number;lastExtension?:number;lastEnabled?:boolean;active:boolean;nodes:AudioNode[]};
export class SaberAudio {
 private context:AudioContext|null=null;private master:GainNode|null=null;private voices:Partial<Record<Side,Voice>>={};
 readonly preparation={ms:0,voices:0,noiseBuffers:0};scheduledCalls=0;skippedUpdates=0;skippedParameters=0;private targets=new WeakMap<AudioParam,number>();private targetSince=new WeakMap<AudioParam,number>();private forceAutomation=false;
 enabled=true;volume=.3;status='等待操作啟用';private disposed=false;
 async unlock(){
  if(this.disposed||!this.enabled)return;
  try{
   if(!this.context){
    const preparedAt=performance.now();
    const Context=window.AudioContext||(window as unknown as {webkitAudioContext:typeof AudioContext}).webkitAudioContext;
    if(!Context)throw Error('Web Audio 不受支援');
    const ctx=new Context();this.context=ctx;this.master=ctx.createGain();this.master.gain.value=this.volume;this.master.connect(ctx.destination);
    this.voices.Left=this.createVoice(ctx,-.45);this.voices.Right=this.createVoice(ctx,.45);this.preparation.ms=performance.now()-preparedAt;this.preparation.voices=2;this.preparation.noiseBuffers=2;
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
 private target(p:AudioParam,value:number,time:number,constant=.045){this.scheduledCalls+=2;p.cancelScheduledValues(time);p.setTargetAtTime(value,time,constant);}
 private automate(p:AudioParam,value:number,time:number,constant=.045){if(this.forceAutomation||this.targets.get(p)!==value){this.targets.set(p,value);this.targetSince.set(p,time);}else if(time-(this.targetSince.get(p)??time)>=1){this.skippedParameters++;return;}this.target(p,value,time,constant);}
 update(side:Side,active:boolean,speed:number,extension:number){
  const ctx=this.context,v=this.voices[side];if(!ctx||!v||ctx.state!=='running')return;
  const now=ctx.currentTime,on=active&&this.enabled;
  const changed=on!==v.active;
  if(changed){
   this.scheduledCalls+=6;
   v.active=on;
   v.sweep.frequency.cancelScheduledValues(now);v.sweep.frequency.setValueAtTime(on?80:550,now);v.sweep.frequency.exponentialRampToValueAtTime(on?580:45,now+(on?.16:.12));
   v.transient.gain.cancelScheduledValues(now);v.transient.gain.setValueAtTime(this.enabled?.065:0,now);v.transient.gain.exponentialRampToValueAtTime(.0001,now+.2);
  }
  if(!changed&&v.lastSpeed===speed&&v.lastExtension===extension&&v.lastEnabled===this.enabled){if(now-(v.stableSince??now)>=1){this.skippedUpdates++;return;}}else v.stableSince=now;
  this.forceAutomation=changed||v.lastEnabled===undefined;
  v.lastSpeed=speed;v.lastExtension=extension;v.lastEnabled=this.enabled;
  const motion=soundForSpeed(speed),gain=this.enabled?extension:0;
  this.automate(v.osc.frequency,motion.pitch*(side==='Left'?1:1.07),now);this.automate(v.harmonic.frequency,motion.pitch*2.012,now);
  this.automate(v.filter.frequency,motion.cutoff,now);this.automate(v.windFilter.frequency,500+motion.cutoff,now);
  this.automate(v.hum.gain,motion.gain*gain,now,.025);this.automate(v.wind.gain,motion.wind*gain,now,.035);
  this.forceAutomation=false;
 }
 configure(enabled:boolean,volume:number){this.enabled=enabled;this.volume=Math.max(0,Math.min(1,volume));if(this.master&&this.context)this.target(this.master.gain,enabled?this.volume:0,this.context.currentTime,.03);if(!enabled)this.status='已靜音';}
 stop(){
  const ctx=this.context;if(!ctx)return;
  for(const v of Object.values(this.voices)){v.active=false;v.lastSpeed=undefined;for(const gain of [v.hum,v.wind,v.transient])this.target(gain.gain,0,ctx.currentTime,.012);}
  // Keep the context unlockable from the next user gesture; no background sound.
  this.status=this.enabled?'待命':'已靜音';
 }
 dispose(){
  if(this.disposed)return;this.disposed=true;this.stop();
  for(const v of Object.values(this.voices)){for(const source of [v.osc,v.harmonic,v.sweep,v.noise])source.stop();for(const node of v.nodes)node.disconnect();}
  this.master?.disconnect();void this.context?.close().catch(()=>{});this.voices={};this.context=null;this.master=null;
 }
}
