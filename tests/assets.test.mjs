import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readAsset} from '../src/assets.ts';
import {withActivityTimeout} from '../src/pipeline.ts';
test('asset download reports HTTP failure by asset and status',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>new Response('missing',{status:404});
 try{await assert.rejects(readAsset('/model','手部模型',undefined,()=>{}),/手部模型 HTTP 404/);}finally{globalThis.fetch=original;}
});
test('asset download preserves binary chunks, reports completion and passes cancellation signal',async()=>{
 const original=globalThis.fetch,abort=new AbortController(),reports=[];let signal;
 globalThis.fetch=async(_,options)=>{signal=options.signal;return new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2]));c.enqueue(new Uint8Array([3,4]));c.close();}}))};
 try{const data=await readAsset('/wasm','WASM',abort.signal,s=>reports.push(s));assert.deepEqual([...data],[1,2,3,4]);assert.equal(signal,abort.signal);assert.match(reports[0],/連線中/);assert.match(reports.at(-1),/下載完成/);}finally{globalThis.fetch=original;}
});
test('download progress extends the idle deadline; late callbacks do not reopen timers',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let touch,resolve;
 const pending=withActivityTimeout(fn=>{touch=fn;return new Promise(r=>resolve=r)},10,'stalled');
 t.mock.timers.tick(9);touch();t.mock.timers.tick(9);resolve(42);assert.equal(await pending,42);touch();t.mock.timers.tick(100);t.mock.timers.reset();
});
test('no download activity produces a distinct stalled initialization error',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const pending=withActivityTimeout(()=>new Promise(()=>{}),10,'下載停滯');const check=assert.rejects(pending,/下載停滯/);t.mock.timers.tick(11);await check;t.mock.timers.reset();
});
