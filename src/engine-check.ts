import {createModel} from './model';
import {withTimeout,withActivityTimeout,FallbackPipeline} from './pipeline';
const button=document.querySelector<HTMLButtonElement>('#run')!,output=document.querySelector<HTMLPreElement>('#result')!;
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
