import {createModel} from './model';
import {withTimeout,withActivityTimeout,FallbackPipeline} from './pipeline';
import {loadAssetManifest,readAsset,CACHE_PREFIX} from './assets';
import {workerRuntime,mainRuntime} from './runtime';
import {checkAudioPeak} from './audio-check';
const button=document.querySelector<HTMLButtonElement>('#run')!,output=document.querySelector<HTMLPreElement>('#result')!;
const soundButton=document.querySelector<HTMLButtonElement>('#sound')!,soundOutput=document.querySelector<HTMLPreElement>('#sound-result')!;
soundButton.onclick=async()=>{soundButton.disabled=true;soundOutput.textContent='原始合成音效峰值檢查中…';try{soundOutput.textContent=JSON.stringify(await checkAudioPeak(),null,2);}catch(e){soundOutput.textContent='FAIL：'+String(e);}finally{soundButton.disabled=false;}};
button.onclick=async()=>{
 button.disabled=true;output.textContent='';const write=(line:string)=>{output.textContent+=line+'\n';};
 const base=new URL(import.meta.env.BASE_URL,location.origin).href,canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;canvas.getContext('2d')!.fillRect(0,0,640,480);
 const worker=new Worker(new URL('./tracker.worker.ts',import.meta.url),{type:'module'});
 try{
  write('開始 Worker 模型載入');await withActivityTimeout(touch=>new Promise<void>((resolve,reject)=>{worker.onmessage=({data})=>{if(data.type==='ready')resolve();else if(data.type==='stage'){touch();write(data.message);}else if(data.type==='error')reject(Error(data.message));};worker.onerror=e=>reject(Error(e.message));worker.postMessage({type:'init',base});}),20000,'Worker download/initialization stalled');write('PASS：Worker 模型初始化');
  const bitmap=await createImageBitmap(canvas);
  const workerResult=await withTimeout(new Promise<number>((resolve,reject)=>{worker.onmessage=({data})=>data.type==='result'?resolve(data.landmarks.length):reject(Error(data.message));worker.postMessage({type:'frame',frame:bitmap,time:performance.now()},[bitmap]);}),5000,'Worker inference timeout');
  write('PASS：Worker ImageBitmap 推論，偵測 '+workerResult+' 隻手');
 }catch(e){write('FAIL：Worker '+String(e));}finally{worker.terminate();}
 let model:Awaited<ReturnType<typeof createModel>>|null=null;
 try{
  write('開始主執行緒模型載入');const abort=new AbortController();
  model=await withActivityTimeout(touch=>createModel(base,abort.signal,message=>{touch();write(message);}),20000,'Main-thread download/initialization stalled').catch(e=>{abort.abort();throw e;});write('PASS：主執行緒模型初始化');const r=model.detectForVideo(canvas,performance.now());write('PASS：主執行緒 canvas 推論，偵測 '+r.landmarks.length+' 隻手');
  const mainModel=model;
  const pipeline=new FallbackPipeline<HTMLCanvasElement,number>(async()=>{throw Error('Injected unsupported Worker');},async()=>({name:'main',detect:async frame=>mainModel.detectForVideo(frame,performance.now()).landmarks.length,dispose:()=>{}}),write);
  await pipeline.init();await pipeline.detect(canvas,performance.now());pipeline.dispose();write('PASS：Worker 初始化失敗 → 主執行緒備援推論');
 }catch(e){write('FAIL：主執行緒 '+String(e));}finally{model?.close();canvas.width=canvas.height=0;button.disabled=false;write('DONE：測試資源已釋放');}
};
const cacheButton=document.querySelector<HTMLButtonElement>('#cache')!,cacheOutput=document.querySelector<HTMLPreElement>('#cache-result')!;
cacheButton.onclick=async()=>{
 cacheButton.disabled=button.disabled=true;cacheOutput.textContent='';const write=(s:string)=>{cacheOutput.textContent+=s+'\n';};
 const base=new URL(import.meta.env.BASE_URL,location.origin).href,abort=new AbortController(),canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
 let cleanup=()=>{},temporary='';
 try{
  const manifest=await loadAssetManifest(base,write),spec=manifest.files['hand_landmarker.task'],url=base+'hand_landmarker.task';temporary=CACHE_PREFIX+manifest.version+'-qa';await caches.delete(temporary);
  const stages:string[]=[],report=(s:string)=>{stages.push(s);write(s);};
  const read=()=>readAsset(url,'模型測試',abort.signal,report,spec,manifest.version+'-qa');
  await read();stages.length=0;await read();if(stages.some(s=>s.startsWith('下載')))throw Error('快取命中仍下載');write('PASS：真實 Cache Storage 命中，不呼叫資源 fetch');
  const cache=await caches.open(temporary);await cache.put(url+'?sha256='+spec.sha256,new Response(new Uint8Array(spec.bytes)));stages.length=0;await read();if(!stages.some(s=>s.includes('快取損壞')))throw Error('未偵測同長度損壞');write('PASS：SHA-256 偵測損壞並重新取得資源');
  await caches.delete(temporary);stages.length=0;await read();if(!stages.some(s=>s.startsWith('下載')))throw Error('清除後未取得資源');write('PASS：快取清除後自動恢復');
  for(const mode of ['worker','main'] as const){
   const acquire=()=>mode==='worker'?workerRuntime(base,abort.signal,write):mainRuntime(base,abort.signal,write);
   const start=performance.now(),a=await acquire();cleanup=a.invalidate;const first=a.value;write(`${mode} 冷引擎初始化 ${(performance.now()-start).toFixed(1)} ms（資源可已快取）`);
   if('model' in a.value)a.value.model.detectForVideo(canvas,performance.now());else await a.value.detect(await createImageBitmap(canvas),performance.now());a.release();
   const resume=performance.now(),b=await acquire(),acquireMs=performance.now()-resume;cleanup=b.invalidate;if(b.value!==first)throw Error('引擎未重用');const inference=performance.now();
   if('model' in b.value)b.value.model.detectForVideo(canvas,performance.now());else await b.value.detect(await createImageBitmap(canvas),performance.now());
   write(`PASS：${mode} 同一引擎重用；取得 ${acquireMs.toFixed(1)} ms，空白推論 ${(performance.now()-inference).toFixed(1)} ms`);b.invalidate();cleanup=()=>{};
  }
 }catch(e){write('FAIL：'+String(e));}finally{cleanup();abort.abort();if(temporary)await caches.delete(temporary);canvas.width=canvas.height=0;cacheButton.disabled=button.disabled=false;write('DONE：QA 快取、模型、Worker 已釋放');}
};
