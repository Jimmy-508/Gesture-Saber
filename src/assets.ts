/** Download once with byte progress; consumers receive buffers, not a second network URL. */
export async function readAsset(url:string,label:string,signal:AbortSignal|undefined,report:(stage:string)=>void,spec?:AssetSpec,version?:string){
 const cache=spec&&version?await openCache(CACHE_PREFIX+version):null;
 const key=spec?url+'?sha256='+spec.sha256:url;
 if(cache){
  report(`讀取快取：${label}`);
  try{
   const saved=await cache.match(key);
   if(saved){const bytes=new Uint8Array(await saved.arrayBuffer());if(await valid(bytes,spec!)){checkAbort(signal);report(`快取已驗證：${label}`);return bytes;}await cache.delete(key);report(`${label}快取損壞，重新下載`);}
  }catch(e){checkAbort(signal);report(`${label}快取無法讀取，重新取得`);try{await cache.delete(key);}catch{/* Storage may be unavailable. */}}
 }
 const bytes=await download(url,label,signal,report);checkAbort(signal);
 if(spec&&!await valid(bytes,spec))throw Error(`${label}完整性檢查失敗，請重新載入`);
 if(cache){try{await cache.put(key,new Response(bytes.slice().buffer));}catch{report(`${label}已載入；裝置無法保留離線快取`);}}
 return bytes;
}
export const CACHE_PREFIX='gesture-saber-model-v1-';
export type AssetSpec={bytes:number;sha256:string};
export type AssetManifest={version:string;files:Record<string,AssetSpec>};
const manifests=new Map<string,Promise<AssetManifest>>();
function checkAbort(signal?:AbortSignal){if(signal?.aborted)throw new DOMException('Session cancelled','AbortError');}
async function openCache(name:string){try{return typeof caches==='undefined'?null:await caches.open(name);}catch{return null;}}
async function valid(bytes:Uint8Array,spec:AssetSpec){return bytes.length===spec.bytes&&Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.slice().buffer)),n=>n.toString(16).padStart(2,'0')).join('')===spec.sha256;}
function parseManifest(text:string):AssetManifest{
 const m=JSON.parse(text) as AssetManifest;
 if(!/^[a-f0-9]{16}$/.test(m.version)||!m.files?.['hand_landmarker.task']||Object.entries(m.files).some(([name,s])=>! /^(hand_landmarker\.task|wasm\/[\w.]+)$/.test(name)||!Number.isInteger(s.bytes)||s.bytes<=0||! /^[a-f0-9]{64}$/.test(s.sha256)))throw Error('模型資源清單無效');
 return m;
}
/** Small manifest revalidates once per realm; content-addressed files survive reloads. */
export function loadAssetManifest(base:string,report:(s:string)=>void,expectedVersion?:string):Promise<AssetManifest>{
 const manifestKey=base+(expectedVersion??'');let pending=manifests.get(manifestKey);if(pending)return pending;
 pending=(async()=>{
  const index=await openCache(CACHE_PREFIX+'index'),url=base+'model-assets.json';let m:AssetManifest;
  report('檢查模型資源版本');
  try{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
   let text:string;
   try{const r=await fetch(url+(expectedVersion?'?v='+expectedVersion:''),{cache:'no-cache',signal:controller.signal});if(!r.ok)throw Error('資源清單 HTTP '+r.status);text=await r.text();}finally{clearTimeout(timer);}
   m=parseManifest(text);try{await index?.put(url,new Response(text));}catch{/* Cache quota must not prevent tracking. */}
  }
  catch(e){const saved=await index?.match(url);if(!saved)throw e;try{m=parseManifest(await saved.text());report('無法連線取得清單：使用已保存的完整模型版本');}catch{await index?.delete(url);throw e;}}
  if(expectedVersion&&m.version!==expectedVersion)throw Error('模型資源版本已更新，請重新整理網站後啟動，避免混用不同版本的辨識引擎');
  // Only this application's caches; old incompatible resource sets are not reused.
  try{for(const name of await caches.keys())if(name.startsWith(CACHE_PREFIX)&&name!==CACHE_PREFIX+'index'&&name!==CACHE_PREFIX+m.version)await caches.delete(name);}catch{/* Cache Storage may be disabled. */}
  return m;
 })();manifests.set(manifestKey,pending);pending.catch(()=>manifests.delete(manifestKey));return pending;
}
async function download(url:string,label:string,signal:AbortSignal|undefined,report:(stage:string)=>void){
 report(`下載${label}：連線中`);const response=await fetch(url,{signal});if(!response.ok)throw Error(`${label} HTTP ${response.status}：${url}`);
 const reader=response.body?.getReader();if(!reader){const bytes=new Uint8Array(await response.arrayBuffer());report(`${label}下載完成：${(bytes.length/1048576).toFixed(1)} MB`);return bytes;}
 const chunks:Uint8Array[]=[];let length=0,last=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;chunks.push(value);const now=performance.now();if(now-last>500){report(`下載${label}：${(length/1048576).toFixed(1)} MB`);last=now;}}}finally{reader.releaseLock();}
 report(`${label}下載完成：${(length/1048576).toFixed(1)} MB`);
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
