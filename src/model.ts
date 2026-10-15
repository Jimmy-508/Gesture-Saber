import {FilesetResolver,HandLandmarker} from '@mediapipe/tasks-vision';
import {readAsset} from './assets';
let queue:Promise<unknown>=Promise.resolve();
export function createModel(base:string,signal?:AbortSignal,report:(stage:string)=>void=()=>{}){
 const pending=queue.catch(()=>{}).then(async()=>{
  const check=()=>{if(signal?.aborted)throw new DOMException('Session cancelled','AbortError');};check();
  // Module workers need ESM glue; document script loading needs classic glue.
  const files=await FilesetResolver.forVisionTasks(base+'wasm',typeof document==='undefined');
  // Expose real HTTP progress; buffers avoid downloading the same asset again in the loader.
  const bytes=await readAsset(base+'hand_landmarker.task','手部模型',signal,report);check();
  const wasm=await readAsset(files.wasmBinaryPath,'WASM',signal,report);check();
  const wasmUrl=URL.createObjectURL(new Blob([wasm],{type:'application/wasm'}));
  files.wasmBinaryPath=wasmUrl;
  report('資源已下載，正在初始化 WASM 與手部模型');
  try{
   const model=await HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetBuffer:bytes,delegate:'CPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.55});
   if(signal?.aborted){model.close();check();}return model;
  }finally{URL.revokeObjectURL(wasmUrl);}
 });
 queue=pending.then(()=>{},()=>{});return pending;
}
