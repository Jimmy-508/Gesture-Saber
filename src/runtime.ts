import {EnginePool,type Lease,type Resource} from './engine-pool.ts';
import {withActivityTimeout,withTimeout} from './pipeline.ts';
import type {TrackingResult} from './tracking';
import type {HandLandmarker} from '@mediapipe/tasks-vision';
type Main=Resource&{model:HandLandmarker};
type Remote=Resource&{detect(frame:ImageBitmap,time:number):Promise<TrackingResult>};
const pool=new EnginePool<Main|Remote>();
let workerFailed=false;
if(typeof window!=='undefined')window.addEventListener('pagehide',()=>pool.clear());
export function avoidWorker(){workerFailed=true;}
export function runtimeStatus(){return pool.state==='idle'?'引擎閒置保留最多 2 分鐘':pool.state==='loading'?'取消初始化並釋放資源':'已釋放';}
export async function mainRuntime(base:string,signal:AbortSignal,report:(s:string)=>void){
 return await pool.acquire(base+'main',async()=>{
  const controller=new AbortController(),cancel=()=>controller.abort();signal.addEventListener('abort',cancel,{once:true});
  let model:HandLandmarker;
  try{model=await withActivityTimeout(async touch=>{const {createModel}=await import('./model');return createModel(base,controller.signal,s=>{touch();report(s);}).then(m=>{if(controller.signal.aborted){m.close();throw new DOMException('cancelled','AbortError');}return m;});},20000,'模型初始化停滯');return {model,close:()=>model!.close()};}
  catch(e){controller.abort();throw e;}finally{signal.removeEventListener('abort',cancel);}
 },signal,report) as Lease<Main>;
}
export async function workerRuntime(base:string,signal:AbortSignal,report:(s:string)=>void){
 if(workerFailed||typeof Worker==='undefined'||typeof createImageBitmap==='undefined')throw Error('使用本頁已選定的主執行緒備援');
 try{return await pool.acquire(base+'worker',async()=>{
  const w=new Worker(new URL('./tracker.worker.ts',import.meta.url),{type:'module'});
  let resolveFrame:((r:TrackingResult)=>void)|null=null,rejectFrame:((e:Error)=>void)|null=null,closed=false;
  const close=()=>{if(closed)return;closed=true;rejectFrame?.(new DOMException('cancelled','AbortError'));resolveFrame=rejectFrame=null;w.terminate();};
  const cancel=()=>{close();rejectInit(new DOMException('cancelled','AbortError'));};let rejectInit:(e:Error)=>void=()=>{};
  signal.addEventListener('abort',cancel,{once:true});
  try{await withActivityTimeout(touch=>new Promise<void>((resolve,reject)=>{
   rejectInit=reject;w.onmessage=({data})=>{if(data.type==='ready')resolve();else if(data.type==='stage'){touch();report(data.message);}else if(data.type==='error')reject(Error(data.message));};w.onerror=e=>{e.preventDefault();reject(Error(e.message||'Worker initialization error'));};w.postMessage({type:'init',base});
  }),20000,'Worker 初始化停滯');}catch(e){close();throw e;}finally{signal.removeEventListener('abort',cancel);}
  w.onmessage=({data})=>{if(data.type==='result'){resolveFrame?.(data);resolveFrame=rejectFrame=null;}else if(data.type==='error'){rejectFrame?.(Error(data.message));resolveFrame=rejectFrame=null;}};
  w.onerror=e=>{e.preventDefault();rejectFrame?.(Error(e.message||'Worker inference error'));resolveFrame=rejectFrame=null;};
  return {close,detect:async(frame:ImageBitmap,time:number)=>{
   if(closed){frame.close();throw Error('Worker closed');}
   if(resolveFrame){frame.close();throw Error('Worker already busy');}
   try{return await withTimeout(new Promise<TrackingResult>((resolve,reject)=>{resolveFrame=resolve;rejectFrame=reject;w.postMessage({type:'frame',frame,time},[frame]);}),3500,'Worker 推論逾時');}
   catch(e){frame.close();close();throw e;}
  }};
 },signal,report) as Lease<Remote>;}catch(e){if(!signal.aborted)workerFailed=true;throw e;}
}
