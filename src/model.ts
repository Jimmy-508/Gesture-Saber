import {FilesetResolver,HandLandmarker} from '@mediapipe/tasks-vision';
import {readAsset,loadAssetManifest} from './assets';
import {MODEL_ASSET_VERSION} from './model-version';
let queue:Promise<unknown>=Promise.resolve();
export function createModel(base:string,signal?:AbortSignal,report:(stage:string)=>void=()=>{}){
 const pending=queue.catch(()=>{}).then(async()=>{
  const check=()=>{if(signal?.aborted)throw new DOMException('Session cancelled','AbortError');};check();
  // Module workers need ESM glue; document script loading needs classic glue.
  const files=await FilesetResolver.forVisionTasks(base+'wasm',typeof document==='undefined');
  const manifest=await loadAssetManifest(base,report,MODEL_ASSET_VERSION);check();
  const asset=(url:string,label:string)=>{const path=url.slice(base.length),spec=manifest.files[path];if(!spec)throw Error('資源版本清單缺少 '+path);return readAsset(url,label,signal,report,spec,manifest.version);};
  const bytes=await asset(base+'hand_landmarker.task','手部模型');check();
  const wasm=await asset(files.wasmBinaryPath,'WASM');check();
  const loader=await asset(files.wasmLoaderPath,'WASM 載入器');check();
  const wasmUrl=URL.createObjectURL(new Blob([wasm],{type:'application/wasm'}));
  const loaderUrl=URL.createObjectURL(new Blob([loader],{type:'text/javascript'}));
  files.wasmBinaryPath=wasmUrl;
  files.wasmLoaderPath=loaderUrl;
  report('資源已驗證，正在初始化 WASM 與手部模型');
  try{
   const model=await HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetBuffer:bytes,delegate:'CPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.55});
   if(signal?.aborted){model.close();check();}return model;
  }finally{URL.revokeObjectURL(wasmUrl);URL.revokeObjectURL(loaderUrl);}
 });
 queue=pending.then(()=>{},()=>{});return pending;
}
