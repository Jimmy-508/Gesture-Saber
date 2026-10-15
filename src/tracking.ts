import {FallbackPipeline,cameraError,withTimeout,withActivityTimeout,type Engine} from './pipeline.ts';
import type {Point} from './gesture';
export type TrackingResult={landmarks:Point[][];world:Point[][];handedness:{categoryName:string;score:number}[][];time:number;ms:number};
export type Diagnostics={camera:string;model:string;pipeline:string;detail:string;mode:string;frames:number};
export const initialDiagnostics:Diagnostics={camera:'尚未啟動',model:'尚未載入',pipeline:'待命',detail:'',mode:'—',frames:0};
type FrameSource=HTMLVideoElement|HTMLCanvasElement;
function abortError(){return new DOMException('Session cancelled','AbortError');}
export class TrackingSession {
 private abort=new AbortController();private media:MediaStream|null=null;private video:HTMLVideoElement|null=null;
 private pipeline:FallbackPipeline<FrameSource,TrackingResult>|null=null;private timer:ReturnType<typeof setTimeout>|null=null;
 private worker:Worker|null=null;private stopped=false;private lastVideoTime=-1;private canvas:HTMLCanvasElement|null=null;private canvasMode=false;private cancelWorkerInit:(()=>void)|null=null;private lastFreshFrame=0;
 private diag={...initialDiagnostics};private rate=24;
 private base:string;private report:(d:Diagnostics)=>void;private result:(r:TrackingResult)=>void;private failure:(message:string)=>void;
 constructor(base:string,report:(d:Diagnostics)=>void,result:(r:TrackingResult)=>void,failure:(message:string)=>void){this.base=base;this.report=report;this.result=result;this.failure=failure;}
 private update(patch:Partial<Diagnostics>){this.diag={...this.diag,...patch};this.report(this.diag);}
 setRate(rate:number){this.rate=rate;}
 async start(forceMain=false){
  let stage='permission';
  try{
   if(!isSecureContext||!navigator.mediaDevices?.getUserMedia)throw Error('需要 HTTPS 網址及支援攝影機的瀏覽器。');
   this.update({camera:'等待權限',detail:'getUserMedia：優先使用前置鏡頭'});
   const pending=navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'user'},width:{ideal:640},height:{ideal:480},frameRate:{ideal:30}}});
   pending.then(media=>{if(this.stopped)media.getTracks().forEach(t=>t.stop());},()=>{});
   const media=await pending;if(this.stopped)return;this.media=media;
   this.update({camera:'已取得串流',detail:'等待 video.play 與首個可讀影格'});stage='video';
   const v=document.createElement('video');v.muted=true;v.playsInline=true;v.autoplay=true;v.setAttribute('playsinline','');v.setAttribute('webkit-playsinline','');v.setAttribute('aria-hidden','true');v.className='tracking-video';document.body.appendChild(v);this.video=v;v.srcObject=media;
   media.getVideoTracks()[0].onended=()=>{if(!this.stopped)this.fail('攝影機串流已中斷，請重新啟動。','camera');};
   await withTimeout(v.play(),12000,'video.play 逾時');
   await withTimeout(new Promise<void>((resolve,reject)=>{
    const check=()=>{if(this.stopped){reject(abortError());return;}if(v.readyState>=2&&v.videoWidth>0){resolve();return;}this.timer=setTimeout(check,40);};check();
   }),12000,'等待攝影機首個影格逾時');
   if(this.stopped)return;
   const info=media.getVideoTracks()[0].getSettings();this.update({camera:`可讀影格 ${info.width??v.videoWidth}×${info.height??v.videoHeight}`,model:'載入中',pipeline:'初始化',detail:'攝影機階段已通過'});
   stage='model';
   this.pipeline=new FallbackPipeline(()=>this.makeWorker(),()=>this.makeMain(),detail=>this.update({pipeline:'切換主執行緒備援',detail}));
   await this.pipeline.init(forceMain);if(this.stopped)return;
   this.lastFreshFrame=performance.now();this.update({model:'已就緒',pipeline:'追蹤中',mode:this.pipeline.engine!.name});void this.loop();
  }catch(e){if(this.stopped)return;this.fail(stage==='model'?'辨識模型初始化失敗（Worker 與可用備援均未成功）：'+String(e):cameraError(e,stage),stage==='model'?'model':'camera');}
 }
 private async makeMain():Promise<Engine<FrameSource,TrackingResult>>{
  this.worker?.terminate();this.worker=null;
  this.update({model:'載入主執行緒模型',mode:'主執行緒 · 直接 video / canvas'});
  const model=await withActivityTimeout(async touch=>{
   const {createModel}=await import('./model');return createModel(this.base,this.abort.signal,message=>{touch();if(!this.stopped)this.update({model:message});});
  },20000,'主執行緒模型載入停滯：20 秒沒有下載或初始化進度').catch(e=>{this.abort.abort();throw e;});
  if(this.stopped){model.close();throw abortError();}let accepted=true;
  return {name:'主執行緒 · video',detect:async(input,time)=>{
   if(!accepted||this.stopped)throw abortError();const start=performance.now();
   let r;try{r=model.detectForVideo(input,time);}catch(e){
    if(input instanceof HTMLCanvasElement)throw e;
    const c=this.drawCanvas(input);this.update({detail:'直接 video 推論失敗，切換 2D canvas 影格'});this.canvasMode=true;r=model.detectForVideo(c,time+.001);
   }
   return {landmarks:r.landmarks,world:r.worldLandmarks,handedness:r.handedness,time,ms:performance.now()-start};
  },dispose:()=>{if(accepted){accepted=false;model.close();}}};
 }
 private async makeWorker():Promise<Engine<FrameSource,TrackingResult>>{
  if(typeof Worker==='undefined'||typeof createImageBitmap==='undefined')throw Error('此瀏覽器不支援 Worker 或 ImageBitmap，使用直接 video 備援');
  const w=new Worker(new URL('./tracker.worker.ts',import.meta.url),{type:'module'});this.worker=w;
  let resolveFrame:((r:TrackingResult)=>void)|null=null,rejectFrame:((e:Error)=>void)|null=null,disposed=false;
  try{
   await withActivityTimeout(touch=>new Promise<void>((resolve,reject)=>{
    this.cancelWorkerInit=()=>reject(abortError());w.onmessage=({data})=>{if(data.type==='ready')resolve();else if(data.type==='stage'){touch();if(!this.stopped)this.update({model:data.message});}else if(data.type==='error')reject(Error(data.stage+': '+data.message));};w.onerror=e=>{e.preventDefault();reject(Error(e.message||'Worker runtime error'));};w.postMessage({type:'init',base:this.base});
   }),20000,'Worker 初始化停滯：20 秒沒有下載或初始化進度');
  }catch(e){w.terminate();if(this.worker===w)this.worker=null;throw e;}finally{this.cancelWorkerInit=null;}
  if(this.stopped){w.terminate();throw abortError();}
  w.onmessage=({data})=>{if(data.type==='result'){resolveFrame?.(data);resolveFrame=rejectFrame=null;}else if(data.type==='error'){rejectFrame?.(Error(data.stage+': '+data.message));resolveFrame=rejectFrame=null;}};
  w.onerror=e=>{e.preventDefault();rejectFrame?.(Error(e.message||'Worker inference error'));resolveFrame=rejectFrame=null;};
  return {name:'Worker · ImageBitmap',detect:async(input,time)=>{
   let bitmap:ImageBitmap;
   try{bitmap=await this.bitmap(input);}catch(e){
    if(disposed||this.stopped)throw abortError();
    if(input instanceof HTMLCanvasElement)throw e;
    this.update({detail:'createImageBitmap(video) 失敗，改用 canvas → ImageBitmap'});this.canvasMode=true;bitmap=await this.bitmap(this.drawCanvas(input));
   }
   if(disposed||this.stopped){bitmap.close();throw abortError();}
   try{return await withTimeout(new Promise<TrackingResult>((resolve,reject)=>{resolveFrame=resolve;rejectFrame=reject;w.postMessage({type:'frame',frame:bitmap,time},[bitmap]);}),3500,'Worker 推論逾時');}catch(e){bitmap.close();throw e;}
  },dispose:()=>{if(disposed)return;disposed=true;rejectFrame?.(abortError());resolveFrame=rejectFrame=null;try{w.postMessage({type:'close'});}catch{/* A crashed worker may already be closed. */}finally{w.terminate();}if(this.worker===w)this.worker=null;}};
 }
 private async bitmap(input:FrameSource){
  let abandoned=false;const pending=createImageBitmap(input);
  pending.then(b=>{if(abandoned||this.stopped)b.close();},()=>{});
  try{return await withTimeout(pending,2500,'ImageBitmap 影格轉換逾時');}catch(e){abandoned=true;throw e;}
 }
 private drawCanvas(v:HTMLVideoElement){
  if(!this.canvas)this.canvas=document.createElement('canvas');const c=this.canvas;
  const w=Math.min(640,v.videoWidth),h=Math.round(w*v.videoHeight/v.videoWidth);if(c.width!==w||c.height!==h){c.width=w;c.height=h;}
  const ctx=c.getContext('2d',{alpha:false});if(!ctx)throw Error('無法建立相容的 2D 影格');ctx.drawImage(v,0,0,w,h);return c;
 }
 private async loop(){
  if(this.stopped||!this.video||!this.pipeline)return;
  const started=performance.now();let cost=0;
  try{
   const v=this.video;
   if(started-this.lastFreshFrame>10000){this.fail('攝影機影格停止更新。請確認頁面位於前景並重新啟動。','camera');return;}
   if(v.readyState>=2&&v.currentTime!==this.lastVideoTime){
    this.lastFreshFrame=started;this.lastVideoTime=v.currentTime;const r=await this.pipeline.detect(this.canvasMode?this.drawCanvas(v):v,started);if(this.stopped)return;
    const name=this.pipeline.engine?.name??'備援中';
    this.update({model:'已就緒',pipeline:'追蹤中',mode:this.canvasMode?(name.startsWith('Worker')?'Worker · canvas → ImageBitmap':'主執行緒 · canvas'):name,frames:this.diag.frames+(r?1:0)});
    if(r){cost=r.ms;this.result(r);}
   }
  }catch(e){if(!this.stopped)this.fail('影格推論失敗（已嘗試可用備援）：'+String(e),'pipeline');return;}
  const main=this.pipeline.engine?.name.startsWith('主執行緒');
  const delay=main?Math.max(35,cost*.8,1000/Math.min(this.rate,18)-cost):Math.max(8,1000/this.rate-(performance.now()-started));
  if(!this.stopped)this.timer=setTimeout(()=>void this.loop(),delay);
 }
 private fail(message:string,stage:'camera'|'model'|'pipeline'){
  this.update({[stage]:'失敗',detail:message});this.stop(false);this.failure(message);
 }
 stop(report=true){
  if(this.stopped)return;this.stopped=true;this.abort.abort();if(this.timer)clearTimeout(this.timer);
  this.pipeline?.dispose();this.pipeline=null;this.cancelWorkerInit?.();this.cancelWorkerInit=null;this.worker?.terminate();this.worker=null;
  this.media?.getTracks().forEach(t=>{t.onended=null;t.stop();});this.media=null;
  if(this.video){this.video.pause();this.video.srcObject=null;this.video.remove();this.video=null;}
  if(this.canvas){this.canvas.width=this.canvas.height=0;this.canvas=null;}
  if(report)this.update({camera:'已釋放',model:'已釋放',pipeline:'已停止'});
 }
}
