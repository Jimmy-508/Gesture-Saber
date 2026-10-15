import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FallbackPipeline,cameraError,withTimeout} from '../src/pipeline.ts';
import {TrackingSession} from '../src/tracking.ts';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
const engine=(name='main')=>({name,closed:0,calls:0,async detect(){this.calls++;return 42},dispose(){this.closed++}});
test('worker initialization failure installs main exactly once',async()=>{
 let mainLoads=0;const main=engine();const p=new FallbackPipeline(async()=>{throw Error('OffscreenCanvas unavailable')},async()=>{mainLoads++;return main},()=>{});
 await p.init();assert.equal(mainLoads,1);assert.equal(await p.detect(null,1),42);await assert.rejects(p.init());p.dispose();p.dispose();assert.equal(main.closed,1);
});
test('runtime failure disposes worker before main; drops failed frame and never loops fallback',async()=>{
 const worker=engine('worker'),main=engine();worker.detect=async()=>{throw Error('ImageBitmap failed')};let loads=0;
 const p=new FallbackPipeline(async()=>worker,async()=>{assert.equal(worker.closed,1);loads++;return main},()=>{});
 await p.init();assert.equal(await p.detect(null,1),null);assert.equal(await p.detect(null,2),42);assert.equal(loads,1);
 main.detect=async()=>{throw Error('inference failed')};await assert.rejects(p.detect(null,3),/inference failed/);assert.equal(loads,1);p.dispose();assert.equal(main.closed,1);
});
test('late initialization is closed after cancellation, without starting fallback',async()=>{
 const d=deferred(),e=engine();let fallbacks=0;const p=new FallbackPipeline(()=>d.promise,async()=>{fallbacks++;return engine()},()=>{});
 const init=p.init();p.dispose();d.resolve(e);await assert.rejects(init,/cancelled/);assert.equal(e.closed,1);assert.equal(fallbacks,0);
});
test('only one inference is in flight; manual main mode skips worker',async()=>{
 const d=deferred(),main=engine();main.detect=()=>d.promise;
 const p=new FallbackPipeline(async()=>{throw Error('must not initialize worker')},async()=>main,()=>{});await p.init(true);
 const first=p.detect(null,1);assert.equal(await p.detect(null,2),null);d.resolve(10);assert.equal(await first,10);p.dispose();
});
test('camera failure messages distinguish permission, missing device, busy device and video decoding',()=>{
 assert.match(cameraError({name:'NotAllowedError'}),/權限遭拒絕/);assert.match(cameraError({name:'NotFoundError'}),/找不到/);assert.match(cameraError({name:'NotReadableError'}),/占用/);assert.match(cameraError(Error('play failed'),'video'),/無法播放/);
});
test('camera initialization reports its own stage and stops on permission denial',async()=>{
 Object.defineProperty(globalThis,'isSecureContext',{value:true,configurable:true});
 Object.defineProperty(globalThis,'navigator',{value:{mediaDevices:{getUserMedia:async()=>{throw {name:'NotAllowedError'}}}},configurable:true});
 const reports=[],errors=[];const s=new TrackingSession('/',d=>reports.push(d),()=>assert.fail('No inference after denial'),e=>errors.push(e));await s.start();
 assert.equal(reports[0].camera,'等待權限');assert.equal(reports.at(-1).camera,'失敗');assert.equal(reports.at(-1).model,'尚未載入');assert.match(errors[0],/權限遭拒絕/);s.stop();
});
test('camera permission resolving after cancellation releases late stream',async()=>{
 const d=deferred();let stopped=0;
 Object.defineProperty(globalThis,'navigator',{value:{mediaDevices:{getUserMedia:()=>d.promise}},configurable:true});
 const s=new TrackingSession('/',()=>{},()=>{},()=>assert.fail('cancelled session cannot fail'));const pending=s.start();s.stop();d.resolve({getTracks:()=>[{stop:()=>stopped++}]});await pending;assert.equal(stopped,1);
});
test('timeout rejects instead of leaving an inference pending forever',async()=>{await assert.rejects(withTimeout(new Promise(()=>{}),5,'frame timeout'),/frame timeout/)});
test('successful camera session uses front camera, consumes frames and releases video, stream and model once',async()=>{
 let trackStops=0,pauses=0,removes=0,options;
 const track={stop:()=>trackStops++,getSettings:()=>({width:640,height:480}),onended:null};
 const v={muted:false,playsInline:false,autoplay:false,srcObject:null,setAttribute(){},className:'',videoWidth:640,videoHeight:480,readyState:2,currentTime:1,play:async()=>{},pause:()=>pauses++,remove:()=>removes++};
 Object.defineProperty(globalThis,'navigator',{value:{mediaDevices:{getUserMedia:async opts=>{options=opts;return {getTracks:()=>[track],getVideoTracks:()=>[track]}}}},configurable:true});
 globalThis.document={body:{appendChild(){}},createElement:()=>v};
 const model=engine('主執行緒 · video');model.detect=async()=>({landmarks:[],world:[],handedness:[],time:1,ms:10});
 const results=[],reports=[];const s=new TrackingSession('/',d=>reports.push(d),r=>results.push(r),()=>assert.fail('No failure expected'));s.makeMain=async()=>model;
 await s.start(true);await new Promise(setImmediate);assert.deepEqual(options.video.facingMode,{ideal:'user'});assert.equal(options.audio,false);assert.equal(results.length,1);assert.equal(reports.at(-1).pipeline,'追蹤中');
 s.stop();s.stop();assert.equal(trackStops,1);assert.equal(pauses,1);assert.equal(removes,1);assert.equal(model.closed,1);assert.equal(v.srcObject,null);assert.equal(reports.at(-1).model,'已釋放');
});
test('video playback failure is reported before model loading and releases acquired camera',async()=>{
 let stopped=0;const track={stop:()=>stopped++,onended:null};
 Object.defineProperty(globalThis,'navigator',{value:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[track],getVideoTracks:()=>[track]})}},configurable:true});
 globalThis.document={body:{appendChild(){}},createElement:()=>({setAttribute(){},play:async()=>{throw Error('decode failure')},pause(){},remove(){}})};
 const errors=[],reports=[];const s=new TrackingSession('/',d=>reports.push(d),()=>{},e=>errors.push(e));s.makeMain=()=>assert.fail('Model must not load before video readiness');await s.start(true);assert.match(errors[0],/無法播放或讀取影格/);assert.equal(stopped,1);assert.equal(reports.at(-1).model,'尚未載入');
});
