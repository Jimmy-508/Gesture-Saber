import {SaberAudio} from './audio';
import {BladeState} from './dynamics';
import type {Side} from './gesture';
/** QA only: exercise the actual production graph against a deterministic clock.
 * No duplicate synthesizer or prerecorded imitation of the restored sound. */
export async function checkAudioPeak(){
 const results=[];
 for(const speed of [0,8,24]){
  const ctx=new OfflineAudioContext(2,48000*3,48000),audio=new SaberAudio();let time=0;
  const probe=audio as unknown as {context:{readonly currentTime:number;state:string;close():Promise<void>};master:GainNode;voices:Partial<Record<Side,unknown>>;createVoice(ctx:BaseAudioContext,pan:number):unknown};
  probe.master=ctx.createGain();probe.master.gain.value=1;probe.master.connect(ctx.destination);
  probe.voices.Left=probe.createVoice(ctx,-.45);probe.voices.Right=probe.createVoice(ctx,.45);
  probe.context={get currentTime(){return time;},state:'running',close:async()=>{}};
  const left=new BladeState(),right=new BladeState();
  try{
   for(let i=0;i<180;i++){
    time=i/60;
    left.observe(time>=.1&&time<1.2||time>=1.6&&time<2.5,time*1000);right.observe(time>=.4&&time<1.3||time>=1.6&&time<2.5,time*1000);
    left.step(time*1000,1/60);right.step(time*1000,1/60);
    audio.update('Left',left.active,speed,left.extension);audio.update('Right',right.active,speed,right.extension);
    if(i===50)audio.pulse('Left',true);if(i===130)audio.pulse('Left',false);if(i===162)audio.stop();
   }
   const start=performance.now(),buffer=await ctx.startRendering();let peak=0,tail=0,finite=true;
   for(let channel=0;channel<2;channel++){const samples=buffer.getChannelData(channel);for(let i=0;i<samples.length;i++){finite&&=Number.isFinite(samples[i]);peak=Math.max(peak,Math.abs(samples[i]));if(i>=samples.length-2400)tail+=samples[i]*samples[i];}}
   const tailRms=Math.sqrt(tail/4800);results.push({speed,volume:1,peak,tailRms,renderMs:performance.now()-start,pass:finite&&peak<.98&&tailRms<.00001});
  }finally{audio.dispose();}
 }
 return {method:'Actual Phase 1.1 production graph rendered offline at maximum volume; independent and simultaneous ignition/retraction, then stop. No microphone/speaker/tablet listening validation.',results,pass:results.every(r=>r.pass)};
}
