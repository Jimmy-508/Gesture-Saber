import type {Side} from './gesture';
import {soundForSpeed} from './dynamics.ts';
type Voice={osc:OscillatorNode;harmonic:OscillatorNode;sweep:OscillatorNode;noise:AudioBufferSourceNode;filter:BiquadFilterNode;windFilter:BiquadFilterNode;hum:GainNode;wind:GainNode;transient:GainNode;pan:StereoPannerNode;lastSpeed?:number;lastExtension?:number;lastEnabled?:boolean;active:boolean;nodes:AudioNode[]};
export class SaberAudio {
 private context:AudioContext|null=null;private master:GainNode|null=null;private voices:Partial<Record<Side,Voice>>={};
 readonly preparation={ms:0,voices:0,noiseBuffers:0};scheduledCalls=0;skippedUpdates=0;skippedParameters=0;private targets=new WeakMap<AudioParam,number>();private forceAutomation=false;private suspendTimer:ReturnType<typeof setTimeout>|undefined;private parked=false;private epoch=0;
 enabled=true;volume=.3;status='等待操作啟用';private disposed=false;
 async unlock(){
  if(this.disposed||!this.enabled)return;
  if(this.suspendTimer!==undefined){clearTimeout(this.suspendTimer);this.suspendTimer=undefined;}const ticket=++this.epoch;try{
   if(!this.context){
    const preparedAt=performance.now();
    const Context=window.AudioContext||(window as unknown as {webkitAudioContext:typeof AudioContext}).webkitAudioContext;
    if(!Context)throw Error('Web Audio 不受支援');
    const ctx=new Context();this.context=ctx;this.master=ctx.createGain();this.master.gain.value=this.volume;this.master.connect(ctx.destination);
    this.voices.Left=this.createVoice(ctx,-.45);this.voices.Right=this.createVoice(ctx,.45);this.preparation.ms=performance.now()-preparedAt;this.preparation.voices=2;this.preparation.noiseBuffers=2;
   }
   if(this.parked&&this.context.state==='suspended')this.silenceParked();this.parked=false;
   await this.context.resume();if(this.disposed||ticket!==this.epoch)return;this.status=this.context.state==='running'?'已啟用':'音訊暫停，點擊音效開關恢復';
  }catch(e){if(!this.disposed&&ticket===this.epoch)this.status='音訊無法啟用：'+String(e);}
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
 private automate(p:AudioParam,value:number,time:number,constant=.045,absolute=0,relative=0){const previous=this.targets.get(p);if(!this.forceAutomation&&previous!==undefined&&(value===previous||(value!==0&&Math.abs(value-previous)<=Math.max(absolute,Math.abs(value)*relative)))){this.skippedParameters++;return;}this.targets.set(p,value);this.target(p,value,time,constant);}
 update(side:Side,active:boolean,speed:number,extension:number){
  const ctx=this.context,v=this.voices[side];if(!ctx||!v||ctx.state!=='running'||!this.enabled)return;
  const now=ctx.currentTime,on=active&&this.enabled;
  const changed=on!==v.active;
  if(changed){
   this.scheduledCalls+=6;
   v.active=on;
   v.sweep.frequency.cancelScheduledValues(now);v.sweep.frequency.setValueAtTime(on?80:550,now);v.sweep.frequency.exponentialRampToValueAtTime(on?580:45,now+(on?.16:.12));
   v.transient.gain.cancelScheduledValues(now);v.transient.gain.setValueAtTime(this.enabled?.065:0,now);v.transient.gain.exponentialRampToValueAtTime(.0001,now+.2);
  }
  const envelope=v.lastExtension!==extension,enabledChanged=v.lastEnabled!==this.enabled;
  if(!changed&&!enabledChanged&&(v.lastSpeed===speed&&v.lastExtension===extension)){this.skippedUpdates++;return;}

  this.forceAutomation=changed||v.lastEnabled===undefined;
  v.lastSpeed=speed;v.lastExtension=extension;v.lastEnabled=this.enabled;
  const motion=soundForSpeed(speed),gain=this.enabled?extension:0;
  const pitchFactor=side==='Left'?1:1.07;this.automate(v.osc.frequency,motion.pitch*pitchFactor,now,.045,.1*pitchFactor,.001);this.automate(v.harmonic.frequency,motion.pitch*2.012,now,.045,.2012,.001);
  const cutoffStep=Math.max(1,motion.cutoff*.002);this.automate(v.filter.frequency,motion.cutoff,now,.045,cutoffStep);this.automate(v.windFilter.frequency,500+motion.cutoff,now,.045,cutoffStep);
  this.automate(v.hum.gain,motion.gain*gain,now,.025,envelope?0:.00015,envelope?0:.003);this.automate(v.wind.gain,motion.wind*gain,now,.035,envelope?0:.00015,envelope?0:.003);
  this.forceAutomation=false;
 }
 /** Reuse the original transient on the one active voice, without another hum. */
 pulse(side:Side,extend:boolean){const ctx=this.context,v=this.voices[side];if(!ctx||!v||ctx.state!=='running'||!this.enabled||!v.active)return;const now=ctx.currentTime;this.scheduledCalls+=6;v.sweep.frequency.cancelScheduledValues(now);v.sweep.frequency.setValueAtTime(extend?80:550,now);v.sweep.frequency.exponentialRampToValueAtTime(extend?580:45,now+(extend?.16:.12));v.transient.gain.cancelScheduledValues(now);v.transient.gain.setValueAtTime(.065,now);v.transient.gain.exponentialRampToValueAtTime(.0001,now+.2);}
 private silenceParked(){if(!this.context)return;this.parked=false;const now=this.context.currentTime;for(const v of Object.values(this.voices))for(const gain of [v.hum,v.wind,v.transient]){this.scheduledCalls+=2;gain.gain.cancelScheduledValues(now);gain.gain.setValueAtTime(0,now);}}
 pause(immediate=false){this.stop();this.parked=true;const ctx=this.context,ticket=++this.epoch;if(this.suspendTimer!==undefined)clearTimeout(this.suspendTimer);if(!ctx||ctx.state==='closed')return;
  // Let the original 12ms stop envelope settle before suspending the cached graph.
  const suspend=()=>{this.suspendTimer=undefined;if(this.disposed||ticket!==this.epoch)return;void ctx.suspend().then(()=>{if(!this.disposed&&ticket===this.epoch){if(ctx.state==='suspended')this.silenceParked();this.status=this.enabled?'已暫停（音訊可重用）':'已靜音';}}).catch(()=>{});};if(immediate)suspend();else this.suspendTimer=setTimeout(suspend,50);
 }
 configure(enabled:boolean,volume:number){const changed=enabled!==this.enabled||volume!==this.volume;this.enabled=enabled;this.volume=Math.max(0,Math.min(1,volume));if(changed&&this.master&&this.context)this.target(this.master.gain,enabled?this.volume:0,this.context.currentTime,.03);if(!enabled)this.status='已靜音';}
 stop(){
  const ctx=this.context;this.targets=new WeakMap();if(!ctx)return;
  for(const v of Object.values(this.voices)){v.active=false;v.lastSpeed=undefined;for(const gain of [v.hum,v.wind,v.transient])this.target(gain.gain,0,ctx.currentTime,.012);}
  // Keep the context unlockable from the next user gesture; no background sound.
  this.status=this.enabled?'待命':'已靜音';
 }
 dispose(){
  if(this.disposed)return;this.disposed=true;if(this.suspendTimer!==undefined)clearTimeout(this.suspendTimer);this.epoch++;this.stop();
  for(const v of Object.values(this.voices)){for(const source of [v.osc,v.harmonic,v.sweep,v.noise])source.stop();for(const node of v.nodes)node.disconnect();}
  this.master?.disconnect();void this.context?.close().catch(()=>{});this.voices={};this.context=null;this.master=null;
 }
}
