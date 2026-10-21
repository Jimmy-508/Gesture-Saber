import {ANALYSIS_RATE} from './music-analysis.ts';
import type {MusicAnalysis} from './rhythm-chart.ts';
import {validateMusicFile,validateMusicBytes} from './music-file.ts';
export {validateMusicFile,MAX_FILE_BYTES} from './music-file.ts';
export type MusicStatus='empty'|'analyzing'|'ready'|'countdown'|'playing'|'paused'|'ended'|'error';
export const MAX_DURATION=900;
export class MusicTransport{
 status:MusicStatus='empty';name='';progress=0;loadProgress:number|null=null;error='';analysis:MusicAnalysis|null=null;volume=.65;syncMs=0;revision=0;
 private context:AudioContext|null=null;private gain:GainNode|null=null;private hitGain:GainNode|null=null;private buffer:AudioBuffer|null=null;private source:AudioBufferSourceNode|null=null;private hitBuffer:AudioBuffer|null=null;
 private worker:Worker|null=null;private cancelAnalysis:(()=>void)|null=null;private generation=0;private playEpoch=0;private offset=0;private startAt=0;private sourceFinished=false;private disposed=false;private effectsLevel=.16;private hits=new Set<AudioBufferSourceNode>();
 get loadVersion(){return this.generation;}
 get duration(){return this.buffer?.duration??0;}
 get loaded(){return !!this.buffer&&!!this.analysis;}
 get running(){return this.status==='playing'||this.status==='countdown';}
 get contextState(){return this.context?.state??'未建立';}
 get liveSources(){return (this.source?1:0)+this.hits.size;}
 private prepare(){if(this.disposed)throw Error('音樂系統已關閉。');if(!this.context){const Context=window.AudioContext||(window as unknown as {webkitAudioContext:typeof AudioContext}).webkitAudioContext;if(!Context)throw Error('此瀏覽器不支援 Web Audio。');const ctx=this.context=new Context();this.gain=ctx.createGain();this.gain.gain.value=this.volume;this.gain.connect(ctx.destination);this.hitGain=ctx.createGain();this.hitGain.gain.value=this.effectsLevel;this.hitGain.connect(ctx.destination);
   this.hitBuffer=ctx.createBuffer(1,Math.floor(ctx.sampleRate*.16),ctx.sampleRate);const samples=this.hitBuffer.getChannelData(0);let random=37;for(let i=0;i<samples.length;i++){const t=i/ctx.sampleRate;random=(random*1664525+1013904223)>>>0;samples[i]=((random/0xffffffff*2-1)*.45+Math.sin(2*Math.PI*(820*t-1100*t*t))*.4)*Math.exp(-t*38)*Math.min(1,t/.002);}}
 }
 async unlock(){this.prepare();await this.context!.resume();if(this.disposed)return;if(this.context!.state!=='running')throw Error('音樂播放被瀏覽器暫停，請再次點擊播放。');
 }
 setVolume(value:number){this.volume=Math.max(0,Math.min(1,value));if(this.context&&this.gain)this.gain.gain.setTargetAtTime(this.volume,this.context.currentTime,.025);}
 setSync(value:number){this.syncMs=Math.max(-300,Math.min(300,Number.isFinite(value)?value:0));}
 setEffects(enabled:boolean,volume:number){this.effectsLevel=enabled?Math.min(.4,volume*.53):0;if(!enabled)this.stopHits();if(this.context&&this.hitGain)this.hitGain.gain.setTargetAtTime(this.effectsLevel,this.context.currentTime,.02);}
 private outputTime(){const ctx=this.context;if(!ctx)return 0;const timestamp=ctx.getOutputTimestamp?.();if(timestamp?.contextTime&&timestamp.performanceTime)return Math.min(ctx.currentTime,timestamp.contextTime+Math.max(0,performance.now()-timestamp.performanceTime)/1000);return Math.max(0,ctx.currentTime-(ctx.outputLatency||ctx.baseLatency||0));}
 time(){if(!this.running)return this.offset;const time=this.offset+this.outputTime()-this.startAt;if(this.status==='countdown'&&time>=0)this.status='playing';if(this.sourceFinished&&time>=this.duration){this.offset=this.duration;this.status='ended';this.stopHits();this.revision++;}return Math.min(this.duration,time);}
 gameTime(){return this.time()+this.syncMs/1000;}
 private stopSource(){const source=this.source;this.source=null;if(source){source.onended=null;try{source.stop();}catch{}source.disconnect();}}
 pause(){this.playEpoch++;if(this.running)this.offset=Math.max(0,this.time());this.stopSource();this.stopHits();if(this.loaded&&this.status!=='ended')this.status='paused';this.revision++;}
 stop(){this.pause();this.offset=0;if(this.loaded)this.status='ready';this.revision++;}
 async play(restart=false,automatic=false){const ticket=++this.playEpoch;
  // Automatic starts never wait on a browser gesture. Leave the song ready if
  // Safari has suspended audio; the visible play button can resume it on a tap.
  if(automatic&&this.context?.state!=='running')return false;
  if(!automatic)await this.unlock();if(ticket!==this.playEpoch||this.disposed)return false;if(!this.loaded)throw Error('請先匯入並完成音樂分析。');if(this.running&&!restart)return false;this.stopSource();this.stopHits();if(restart||this.status==='ended')this.offset=0;const ctx=this.context!,source=ctx.createBufferSource();source.buffer=this.buffer;source.connect(this.gain!);this.source=source;this.sourceFinished=false;this.startAt=ctx.currentTime+(this.offset===0?2.5:.08);this.status=this.offset===0?'countdown':'playing';source.onended=()=>{if(this.source!==source)return;source.disconnect();this.source=null;this.sourceFinished=true;this.time();};source.start(this.startAt,this.offset);this.revision++;return true;}
 hit(enabled:boolean){if(!enabled||!this.context||this.context.state!=='running'||!this.hitBuffer||this.hits.size>=4)return;const source=this.context.createBufferSource();source.buffer=this.hitBuffer;source.connect(this.hitGain!);this.hits.add(source);source.onended=()=>{source.disconnect();this.hits.delete(source);};source.start();}
 private stopHits(){for(const source of this.hits){source.onended=null;try{source.stop();}catch{}source.disconnect();}this.hits.clear();}
 clear(){this.generation++;this.cancelAnalysis?.();this.cancelAnalysis=null;this.worker?.terminate();this.worker=null;this.pause();this.buffer=null;this.analysis=null;this.offset=0;this.name='';this.error='';this.progress=0;this.loadProgress=null;this.status='empty';this.revision++;}
 async load(file:File){this.clear();const generation=this.generation;try{validateMusicFile(file);this.name=file.name;this.status='analyzing';this.progress=.03;this.prepare();const bytes=await file.arrayBuffer();if(generation!==this.generation)return;validateMusicBytes(file,bytes);let buffer:AudioBuffer;try{buffer=await this.context!.decodeAudioData(bytes);}catch{throw Error('無法解碼此音樂。檔案可能損壞，或此裝置不支援其 MP3／WAV／M4A／AAC 編碼。');}if(generation!==this.generation||this.disposed)return;if(buffer.duration<1||buffer.duration>MAX_DURATION||buffer.length*buffer.numberOfChannels>90_000_000)throw Error('音樂須為 1 秒至 15 分鐘，解碼資料不可超過裝置資源上限。');
   this.progress=.18;const samples=new Float32Array(Math.ceil(buffer.duration*ANALYSIS_RATE));const channels=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i));
   for(let start=0;start<samples.length;start+=32768){if(generation!==this.generation)return;const end=Math.min(samples.length,start+32768);for(let i=start;i<end;i++){const a=Math.floor(i*buffer.sampleRate/ANALYSIS_RATE),b=Math.max(a+1,Math.min(buffer.length,Math.floor((i+1)*buffer.sampleRate/ANALYSIS_RATE)));let sum=0;for(const channel of channels)for(let j=a;j<b;j++)sum+=channel[j]??0;samples[i]=sum/((b-a)*channels.length);}this.progress=.18+.17*end/samples.length;await new Promise(r=>setTimeout(r,0));}
   if(generation!==this.generation)return;
   const worker=this.worker=new Worker(new URL('./music.worker.ts',import.meta.url),{type:'module'});
   this.loadProgress=0;
   const analysis=await new Promise<MusicAnalysis>((resolve,reject)=>{this.cancelAnalysis=()=>reject(new DOMException('Analysis cancelled','AbortError'));worker.onerror=()=>reject(Error('無法載入此音樂，請重新選擇歌曲。'));worker.onmessage=(e:MessageEvent)=>{if(generation!==this.generation)return;if(e.data.error)reject(Error('無法載入此音樂，請重新選擇歌曲。'));else if(e.data.result)resolve(e.data.result);else if(typeof e.data.progress==='number'&&Number.isFinite(e.data.progress)){this.loadProgress=Math.max(this.loadProgress??0,Math.min(1,Math.max(0,e.data.progress)));this.progress=.35+this.loadProgress*.65;}};worker.postMessage({pcm:samples,rate:ANALYSIS_RATE},[samples.buffer]);});
   worker.terminate();if(this.worker===worker)this.worker=null;if(generation!==this.generation||this.disposed)return;this.cancelAnalysis=null;this.buffer=buffer;this.analysis=analysis;this.progress=1;this.status='ready';this.revision++;
  }catch(error){if(generation!==this.generation||this.disposed)return;this.worker?.terminate();this.worker=null;this.cancelAnalysis=null;this.buffer=null;this.analysis=null;this.status='error';this.error=error instanceof Error?error.message:String(error);this.revision++;}}
 suspend(){if(this.status==='analyzing')this.clear();this.pause();if(this.context?.state==='running')void this.context.suspend().catch(()=>{});}
 dispose(){if(this.disposed)return;this.clear();this.disposed=true;this.gain?.disconnect();this.hitGain?.disconnect();this.hitBuffer=null;const context=this.context;this.context=null;if(context&&context.state!=='closed')void context.close().catch(()=>{});}
}
