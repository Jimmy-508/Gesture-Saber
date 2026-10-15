import type {Side} from './gesture';
import {soundForSpeed} from './dynamics.ts';
type Bank=Record<'hum'|'soft'|'fast'|'ignite'|'retract',AudioBuffer>;
type Voice={sources:AudioBufferSourceNode[];gains:GainNode[];pan:StereoPannerNode;active:boolean;lastUpdate:number;transient:AudioBufferSourceNode|null};
const banks=new Map<number,Bank>();
export class SaberAudio {
 private context:AudioContext|null=null;private master:GainNode|null=null;private voices:Partial<Record<Side,Voice>>={};private bank:Bank|null=null;
 private abort=new AbortController();private loading:Promise<void>|null=null;private disposed=false;
 enabled=true;volume=.3;status='等待操作啟用';parameterWrites=0;
 async unlock(){
  if(this.disposed||!this.enabled)return;
  try{
   if(!this.context){const Context=window.AudioContext||(window as unknown as {webkitAudioContext:typeof AudioContext}).webkitAudioContext;if(!Context)throw Error('Web Audio 不受支援');this.context=new Context();this.master=this.context.createGain();this.master.gain.value=this.volume;this.master.connect(this.context.destination);}
   const ctx=this.context;
   // Resume synchronously from the user gesture, before fetch/decode promises.
   const resume=ctx.resume();
   if(!this.loading)this.loading=this.prepare(ctx);
   await Promise.all([resume,this.loading]);if(this.disposed)return;
   this.status=ctx.state==='running'?'預製音效已啟用':'音訊暫停，點擊音效開關恢復';
  }catch(e){if(!this.disposed){this.loading=null;this.status='音效載入失敗，可點擊音效開關重試：'+String(e);}}
 }
 private async prepare(ctx:AudioContext){
  let bank=banks.get(ctx.sampleRate);
  if(!bank){
   this.status='載入預製能量音效';const names=['hum','soft','fast','ignite','retract'] as const;
   const buffers=await Promise.all(names.map(async name=>{const response=await fetch(new URL(`audio/${name}.wav`,new URL(import.meta.env?.BASE_URL??'/Gesture-Saber/',location.origin)),{signal:this.abort.signal});if(!response.ok)throw Error(name+' HTTP '+response.status);return ctx.decodeAudioData(await response.arrayBuffer());}));
   if(this.disposed)return;bank=Object.fromEntries(names.map((name,i)=>[name,buffers[i]])) as Bank;banks.set(ctx.sampleRate,bank);
  }
  if(this.disposed)return;this.bank=bank;this.voices.Left=this.createVoice(ctx,-.4);this.voices.Right=this.createVoice(ctx,.4);
 }
 private createVoice(ctx:AudioContext,position:number):Voice{
  const pan=ctx.createStereoPanner();pan.pan.value=position;pan.connect(this.master!);const sources:AudioBufferSourceNode[]=[],gains:GainNode[]=[];
  for(const name of ['hum','soft','fast'] as const){const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=this.bank![name];source.loop=true;gain.gain.value=0;source.connect(gain);gain.connect(pan);source.start(0,position<0?0:.37);sources.push(source);gains.push(gain);}
  return {sources,gains,pan,active:false,lastUpdate:-Infinity,transient:null};
 }
 private target(p:AudioParam,value:number,time:number){p.cancelScheduledValues(time);p.setTargetAtTime(value,time,.035);this.parameterWrites++;}
 private transition(v:Voice,on:boolean){
  const ctx=this.context!;if(v.transient){v.transient.onended=null;v.transient.stop();v.transient.disconnect();}
  const source=ctx.createBufferSource();source.buffer=this.bank![on?'ignite':'retract'];source.connect(v.pan);v.transient=source;
  source.onended=()=>{source.disconnect();if(v.transient===source)v.transient=null;};source.start();
 }
 update(side:Side,active:boolean,speed:number,extension:number){
  const ctx=this.context,v=this.voices[side];if(!ctx||!v||ctx.state!=='running')return;
  const now=ctx.currentTime,on=active,changed=on!==v.active;
  if(changed){v.active=on;if(this.enabled)this.transition(v,on);}
  if(!changed&&now-v.lastUpdate<1/30)return;v.lastUpdate=now;
  const level=this.enabled?extension:0,mix=soundForSpeed(speed);
  this.target(v.gains[0].gain,mix.hum*level,now);this.target(v.gains[1].gain,mix.soft*level,now);this.target(v.gains[2].gain,mix.fast*level,now);
  // Broad-band crossfades carry motion; no speed-controlled fundamental-frequency ramp.
 }
 configure(enabled:boolean,volume:number){this.enabled=enabled;this.volume=Math.max(0,Math.min(1,volume));if(this.master&&this.context)this.target(this.master.gain,enabled?this.volume:0,this.context.currentTime);if(!enabled)this.status='已靜音';}
 stop(){if(!this.context)return;for(const v of Object.values(this.voices)){v.active=false;for(const gain of v.gains)this.target(gain.gain,0,this.context.currentTime);if(v.transient){v.transient.onended=null;v.transient.stop();v.transient.disconnect();v.transient=null;}}this.status=this.enabled?'待命':'已靜音';}
 dispose(){if(this.disposed)return;this.disposed=true;this.abort.abort();this.stop();for(const v of Object.values(this.voices)){for(const source of v.sources){source.stop();source.disconnect();}for(const gain of v.gains)gain.disconnect();v.pan.disconnect();}this.master?.disconnect();void this.context?.close();this.voices={};this.context=null;this.master=null;this.bank=null;}
}
