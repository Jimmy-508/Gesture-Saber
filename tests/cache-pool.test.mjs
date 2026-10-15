import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readAsset,loadAssetManifest,CACHE_PREFIX} from '../src/assets.ts';
import {EnginePool} from '../src/engine-pool.ts';
import {FallbackPipeline} from '../src/pipeline.ts';
const sha=b=>createHash('sha256').update(b).digest('hex');
function cacheMock(){const stores=new Map();globalThis.caches={async open(name){if(!stores.has(name))stores.set(name,new Map());const m=stores.get(name);return {async match(k){return m.get(String(k))?.clone()},async put(k,r){m.set(String(k),r.clone())},async delete(k){return m.delete(String(k))}}},async keys(){return [...stores.keys()]},async delete(k){return stores.delete(k)}};return stores;}
test('persistent asset cache hit, corrupt/cleared recovery, integrity failure and version replacement',async()=>{
 const savedFetch=globalThis.fetch;cacheMock();let calls=0;const bytes=new Uint8Array([1,5,8,9]),spec={bytes:4,sha256:sha(bytes)},reports=[];
 globalThis.fetch=async()=>{calls++;return new Response(bytes)};
 const read=version=>readAsset('https://cache.test/model','模型',undefined,s=>reports.push(s),spec,version);
 try{
  await read('a');await read('a');assert.equal(calls,1);assert.ok(reports.includes('快取已驗證：模型'));
  const cache=await caches.open(CACHE_PREFIX+'a');await cache.put('https://cache.test/model?sha256='+spec.sha256,new Response(new Uint8Array([0,0,0,0])));await read('a');assert.equal(calls,2);assert.ok(reports.some(s=>s.includes('快取損壞')));
  await caches.delete(CACHE_PREFIX+'a');await read('a');assert.equal(calls,3);await read('b');assert.equal(calls,4);
  const signal=new AbortController();signal.abort();await assert.rejects(readAsset('https://cache.test/model','模型',signal.signal,()=>{},spec,'b'),{name:'AbortError'});
  globalThis.fetch=async()=>new Response(new Uint8Array([9,9,9,9]));await assert.rejects(read('bad'),/完整性/);
 }finally{globalThis.fetch=savedFetch;delete globalThis.caches;}
});
test('manifest revalidation selects version; offline reload uses saved compatible manifest and cache',async()=>{
 const savedFetch=globalThis.fetch;cacheMock();const bytes=new Uint8Array([1]),spec={bytes:1,sha256:sha(bytes)},base='https://manifest.test/';let version='1111111111111111',calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({version,files:{'hand_landmarker.task':spec}}))};
 try{
  await caches.open(CACHE_PREFIX+'0000000000000000');const a=await loadAssetManifest(base,()=>{});assert.equal(a.version,version);await loadAssetManifest(base,()=>{});assert.equal(calls,1);assert.ok(!(await caches.keys()).includes(CACHE_PREFIX+'0000000000000000'));
  version='2222222222222222';const reloaded=await import('../src/assets.ts?reload=version');assert.equal((await reloaded.loadAssetManifest(base,()=>{})).version,version);
  globalThis.fetch=async()=>{throw Error('offline')};const offline=await import('../src/assets.ts?reload=offline');assert.equal((await offline.loadAssetManifest(base,()=>{})).version,version);
 }finally{globalThis.fetch=savedFetch;delete globalThis.caches;}
});
test('one model lease reuses healthy engine, expires idle, invalidates before mode switch and closes late cancellation',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const pool=new EnginePool(100),signal=new AbortController();let loads=0,closed=0;
 const create=async()=>{loads++;return {close(){closed++}}};
 const a=await pool.acquire('worker',create,signal.signal);await assert.rejects(pool.acquire('main',create,signal.signal),/仍在釋放/);a.release();a.release();
 const b=await pool.acquire('worker',create,signal.signal);assert.equal(loads,1);t.mock.timers.tick(200);assert.equal(closed,0);b.invalidate();assert.equal(closed,1);
 const c=await pool.acquire('main',create,signal.signal);c.release();t.mock.timers.tick(101);assert.equal(closed,2);
 let resolve;const late=pool.acquire('main',()=>new Promise(r=>resolve=r),signal.signal);signal.abort();resolve({close(){closed++}});await assert.rejects(late,{name:'AbortError'});assert.equal(closed,3);pool.clear();t.mock.timers.reset();
});
test('fallback invalidates broken lease and cancellation never retains in-flight worker',async()=>{
 let invalid=0,released=0;const engine={name:'worker',async detect(){throw Error('broken')},dispose(){released++},invalidate(){invalid++}};
 const p=new FallbackPipeline(async()=>engine,async()=>{assert.equal(invalid,1);return {...engine,name:'main',async detect(){return 1}}},()=>{});
 await p.init();await p.detect(null,1);p.dispose();assert.equal(invalid,1);assert.equal(released,1);
 let finish;const q=new FallbackPipeline(async()=>({...engine,detect:()=>new Promise(r=>finish=r)}),async()=>engine,()=>{});await q.init();const pending=q.detect(null,1);q.dispose();assert.equal(invalid,2);finish(1);await pending;
});

test('disabled/quota-limited storage never prevents verified online loading',async()=>{
 const saved=globalThis.fetch,bytes=new Uint8Array([3]),spec={bytes:1,sha256:sha(bytes)};let count=0;
 globalThis.fetch=async()=>{count++;return new Response(bytes)};globalThis.caches={async open(){throw Error('Storage disabled')}};
 try{assert.deepEqual(await readAsset('https://no-cache.test/model','模型',undefined,()=>{},spec,'v'),bytes);assert.equal(count,1);}finally{globalThis.fetch=saved;delete globalThis.caches;}
});

test('a stale JS runtime never initializes with a different model/WASM resource version',async()=>{
 const saved=globalThis.fetch;cacheMock();const spec={bytes:1,sha256:sha(new Uint8Array([1]))};
 globalThis.fetch=async()=>new Response(JSON.stringify({version:'aaaaaaaaaaaaaaaa',files:{'hand_landmarker.task':spec}}));
 try{await assert.rejects(loadAssetManifest('https://pinned.test/',()=>{},'bbbbbbbbbbbbbbbb'),/版本已更新/);}finally{globalThis.fetch=saved;delete globalThis.caches;}
});
