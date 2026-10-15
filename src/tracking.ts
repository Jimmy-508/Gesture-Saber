import {FallbackPipeline,cameraError,withTimeout,type Engine} from './pipeline.ts';
import type {Point} from './gesture';
import {Metric} from './metrics.ts';
import {mainRuntime,workerRuntime,avoidWorker,runtimeStatus} from './runtime.ts';
export type TrackingResult={landmarks:Point[][];world:Point[][];handedness:{categoryName:string;score:number}[][];time:number;ms:number;aspect?:number};
export type Diagnostics={camera:string;model:string;pipeline:string;detail:string;mode:string;frames:number};
export const initialDiagnostics:Diagnostics={camera:'尚未啟動',model:'尚未載入',pipeline:'待命',detail:'',mode:'—',frames:0};
type FrameSource=HTMLVideoElement|HTMLCanvasElement;
function abortError(){return new DOMException('Session cancelled','AbortError');}
export class TrackingSession {
 private abort=new AbortController();private media:MediaStream|null=null;private video:HTMLVideoElement|null=null;
 private pipeline:FallbackPipeline<FrameSource,TrackingResult>|null=null;private timer:ReturnType<typeof setTimeout>|null=null;
 private stopped=false;private lastVideoTime=-1;private canvas:HTMLCanvasElement|null=null;private canvasMode=false;private lastFreshFrame=0;
 private diag={...initialDiagnostics};private rate=24;
 readonly stats={capture:new Metric(),inference:new Metric(),delivery:new Metric(),interval:new Metric(),cameraInterval:new Metric()};
 private published=0;private lastResult=0;private lastCameraFrame=0;private cameraCallback=0;
 private frameCaptureMs=0;
 private base:string;private report:(d:Diagnostics)=>void;private result:(r:TrackingResult)=>void;private failure:(message:string)=>void;
 constructor(base:string,report:(d:Diagnostics)=>void,result:(r:TrackingResult)=>void,failure:(message:string)=>void){this.base=base;this.report=report;this.result=result;this.failure=failure;}
 private update(patch:Partial<Diagnostics>,force=true){Object.assign(this.diag,patch);const now=performance.now();if(force||now-this.published>=500){this.report({...this.diag});this.published=now;}}
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
   if(typeof v.requestVideoFrameCallback==='function'){
    const decoded=(time:number)=>{if(this.stopped)return;if(this.lastCameraFrame)this.stats.cameraInterval.add(time-this.lastCameraFrame);this.lastCameraFrame=time;this.cameraCallback=v.requestVideoFrameCallback(decoded);};this.cameraCallback=v.requestVideoFrameCallback(decoded);
   }
   const info=media.getVideoTracks()[0].getSettings();this.update({camera:`可讀影格 ${info.width??v.videoWidth}×${info.height??v.videoHeight}`,model:'載入中',pipeline:'初始化',detail:'攝影機階段已通過'});
   stage='model';
   this.pipeline=new FallbackPipeline(()=>this.makeWorker(),()=>this.makeMain(),detail=>this.update({pipeline:'切換主執行緒備援',detail}));
   await this.pipeline.init(forceMain);if(this.stopped)return;
   this.lastFreshFrame=performance.now();this.update({model:'已就緒',pipeline:'追蹤中',mode:this.pipeline.engine!.name});void this.loop();
  }catch(e){if(this.stopped)return;this.fail(stage==='model'?'辨識模型初始化失敗（Worker 與可用備援均未成功）：'+String(e):cameraError(e,stage),stage==='model'?'model':'camera');}
 }
 private async makeMain():Promise<Engine<FrameSource,TrackingResult>>{
  this.update({model:'準備主執行緒模型',mode:'主執行緒 · 直接 video / canvas'});
  const lease=await mainRuntime(this.base,this.abort.signal,message=>{if(!this.stopped)this.update({model:message});});
  if(this.stopped){lease.release();throw abortError();}const model=lease.value.model;let accepted=true;
  return {name:'主執行緒 · video',detect:async(input,time)=>{
   if(!accepted||this.stopped)throw abortError();const start=performance.now(),captureBefore=this.frameCaptureMs;
   let r;try{r=model.detectForVideo(input,time);}catch(e){
    if(input instanceof HTMLCanvasElement)throw e;
    const c=this.drawCanvas(input);this.update({detail:'直接 video 推論失敗，切換 2D canvas 影格'});this.canvasMode=true;r=model.detectForVideo(c,time+.001);
   }
   this.stats.capture.add(this.frameCaptureMs);
   return {landmarks:r.landmarks,world:r.worldLandmarks,handedness:r.handedness,time,ms:performance.now()-start-(this.frameCaptureMs-captureBefore)};
  },dispose:()=>{if(accepted){accepted=false;lease.release();}},invalidate:()=>{accepted=false;lease.invalidate();}};
 }
 private async makeWorker():Promise<Engine<FrameSource,TrackingResult>>{
  const lease=await workerRuntime(this.base,this.abort.signal,message=>{if(!this.stopped)this.update({model:message});});
  if(this.stopped){lease.release();throw abortError();}let disposed=false;
  return {name:'Worker · ImageBitmap',detect:async(input,time)=>{
   const captureStart=performance.now(),captureBefore=this.frameCaptureMs;
   let bitmap:ImageBitmap;
   try{bitmap=await this.bitmap(input);}catch(e){
    if(disposed||this.stopped)throw abortError();
    if(input instanceof HTMLCanvasElement)throw e;
    this.update({detail:'createImageBitmap(video) 失敗，改用 canvas → ImageBitmap'});this.canvasMode=true;bitmap=await this.bitmap(this.drawCanvas(input));
   }
   if(disposed||this.stopped){bitmap.close();throw abortError();}
   this.stats.capture.add(captureBefore+performance.now()-captureStart);
   return lease.value.detect(bitmap,time);
  },dispose:()=>{if(disposed)return;disposed=true;lease.release();},invalidate:()=>{disposed=true;if(!this.stopped)avoidWorker();lease.invalidate();}};

 }
 private async bitmap(input:FrameSource){
  let abandoned=false;const pending=createImageBitmap(input);
  pending.then(b=>{if(abandoned||this.stopped)b.close();},()=>{});
  try{return await withTimeout(pending,2500,'ImageBitmap 影格轉換逾時');}catch(e){abandoned=true;throw e;}
 }
 private drawCanvas(v:HTMLVideoElement){
  if(!this.canvas)this.canvas=document.createElement('canvas');const c=this.canvas;
  const w=Math.min(640,v.videoWidth),h=Math.round(w*v.videoHeight/v.videoWidth);if(c.width!==w||c.height!==h){c.width=w;c.height=h;}
  const started=performance.now(),ctx=c.getContext('2d',{alpha:false});if(!ctx)throw Error('無法建立相容的 2D 影格');ctx.drawImage(v,0,0,w,h);this.frameCaptureMs+=performance.now()-started;return c;
 }
 private async loop(){
  if(this.stopped||!this.video||!this.pipeline)return;
  const started=performance.now();let cost=0;
  try{
   const v=this.video;
   if(started-this.lastFreshFrame>10000){this.fail('攝影機影格停止更新。請確認頁面位於前景並重新啟動。','camera');return;}
   if(v.readyState>=2&&v.currentTime!==this.lastVideoTime){
    this.lastFreshFrame=started;this.lastVideoTime=v.currentTime;this.frameCaptureMs=0;const r=await this.pipeline.detect(this.canvasMode?this.drawCanvas(v):v,started);if(this.stopped)return;
    if(!r)this.lastFreshFrame=performance.now(); // Model fallback time is not evidence of a frozen camera.
    const name=this.pipeline.engine?.name??'備援中';
    this.update({model:'已就緒',pipeline:'追蹤中',mode:this.canvasMode?(name.startsWith('Worker')?'Worker · canvas → ImageBitmap':'主執行緒 · canvas'):name,frames:this.diag.frames+(r?1:0)},false);
    if(r){r.aspect=v.videoWidth/v.videoHeight;cost=r.ms;const arrived=performance.now();this.stats.inference.add(r.ms);this.stats.delivery.add(Math.max(0,arrived-r.time));if(this.lastResult)this.stats.interval.add(arrived-this.lastResult);this.lastResult=arrived;this.result(r);}
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
  let releaseError='';try{this.pipeline?.dispose();}catch(e){releaseError='引擎釋放異常，但攝影機已關閉：'+String(e);}finally{this.pipeline=null;}
  this.media?.getTracks().forEach(t=>{t.onended=null;t.stop();});this.media=null;
  if(this.video){if(this.cameraCallback)this.video.cancelVideoFrameCallback?.(this.cameraCallback);this.video.pause();this.video.srcObject=null;this.video.remove();this.video=null;}
  if(this.canvas){this.canvas.width=this.canvas.height=0;this.canvas=null;}
  if(report)this.update({camera:'已釋放',model:runtimeStatus(),pipeline:'已停止（攝影機已釋放）',...(releaseError?{detail:releaseError}:{})});
 }
}
