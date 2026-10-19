// QA helper for the existing integration-check page; never imported by the game.
import {SaberScene} from './scene';import {SaberAudio} from './audio';import {SaberAudio as PreviousAudio} from '../benchmarks/phase17-audio';import {Metric} from './metrics';import {Quaternion,Euler} from 'three';
// @ts-expect-error Shared anatomical fixture, synthetic data only.
import {gripHand} from '../tests/fixtures/grip-hands.mjs';
// @ts-expect-error Shared raw-observation helper.
import {input} from '../tests/fixtures/twin-hands.mjs';
export async function audioComparison(host:HTMLElement){
 const previousHeight=host.style.height;host.style.height='100dvh';
 const old=new PreviousAudio(),current=new SaberAudio(),versions={old,current};for(const a of [old,current]){a.configure(true,.03);await a.unlock();a.stop();await (a as unknown as {context:AudioContext}).context.suspend();}
 let clock=0,selected:PreviousAudio|SaberAudio|null=null;const frame=new Metric(),q=new Quaternion(),euler=new Euler(),scene=new SaberScene(host,(...args)=>selected?.update(...args),false,()=>clock);scene.prepare();
 const results=[];
 try{
  for(const name of ['off-before','old','current','off-after'] as const){
   scene.hide();scene.setQuality('medium');for(const a of [old,current]){a.stop();await (a as unknown as {context:AudioContext}).context.suspend();}selected=name==='old'?versions.old:name==='current'?versions.current:null;if(selected)await selected.unlock();
   let previous=0,sent=0,calls=0;frame.reset();for(const m of Object.values(scene.stats))m.reset();
   for(let i=0;i<180;i++){
    await new Promise(r=>setTimeout(r,1000/60));const wall=performance.now();clock=1000+results.length*5000+i*1000/60;
    if(Math.floor(i*24/60)!==Math.floor((i-1)*24/60)){q.setFromEuler(euler.set(i<30?0:.25*Math.sin(i/17),0,i<30?0:.6*Math.sin(i/14)));const hands=i<30?[gripHand('Left'),gripHand('Right')]:[gripHand('Left',{q,open:true})];scene.receiveControls(input(hands,clock));sent++;}
    if(i===60){for(const m of Object.values(scene.stats))m.reset();calls=selected?.scheduledCalls??0;}
    scene.renderFrame(clock);if(i>=60&&previous)frame.add(wall-previous);previous=wall;
   }
   results.push({name,syntheticObservations:sent,scheduledCalls:(selected?.scheduledCalls??0)-calls,frameIntervalMs:frame.snapshot(),audioUpdateMs:scene.stats.audio.snapshot(),sceneCpuMs:scene.stats.cpu.snapshot(),preparation:selected?.preparation});
  }
 }finally{scene.dispose();host.style.height=previousHeight;for(const a of [old,current])a.dispose();}
 return {viewport:{width:host.clientWidth,height:innerHeight,pixelRatio:scene.pixelRatio},scope:'Same real Three.js/Web Audio scene, fixed 24Hz synthetic observations and 60Hz logical render clock paced by setTimeout. 60 warmup + 120 measured logical frames per case (actual wall-clock frame intervals are reported; browser timers may throttle). No MediaPipe inference, physical camera, tablet FPS or physical latency claim. Audio volume 3%; contexts suspended during off controls. Order off / Phase1.7 / Phase1.8 / off; sequential noise can affect frame intervals.',results};
}
