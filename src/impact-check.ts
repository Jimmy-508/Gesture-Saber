import {Vector3} from 'three';import {SaberScene} from './scene';import {RhythmGame} from './rhythm-game';import {MusicTransport} from './music';import {writeImpact,HIT_GAIN_SMOOTH} from './impact-audio';import {Metric} from './metrics';import {rhythmSceneCheck} from './rhythm-scene-check';import {TRAVEL,FLIGHT_DEPTH,HIT_WINDOW} from './rhythm-chart';
// @ts-expect-error Anatomically mirrored QA fixture; never a production tracker.
import {gripHand} from '../tests/fixtures/grip-hands.mjs';
// @ts-expect-error Shared synthetic MediaPipe packet helper.
import {input} from '../tests/fixtures/twin-hands.mjs';
const host=document.querySelector<HTMLElement>('#view')!,result=document.querySelector('#result')!;let now=1000,time=0;const scene=new SaberScene(host,()=>{},false,()=>now),clock={running:true,status:'playing',gameTime:()=>time},game=new RhythmGame(scene,clock as unknown as MusicTransport),audio=new MusicTransport();const hand=gripHand('Left'),other=gripHand('Right'),point=new Vector3();
function feed(){now+=42;scene.receiveControls(input([hand],now-24));scene.renderFrame(now);}
function display(end:'targets'|'front'|'rear'){
 game.stop();scene.hide();now+=1000;for(let i=0;i<7;i++)feed();
 if(end!=='targets')for(let i=0;i<15;i++){now+=42;scene.receiveControls(input([hand,other],now-24));scene.renderFrame(now);}
 const blade=end==='rear'?scene.weapon.rear:scene.weapon.blade;scene.weapon.group.updateWorldMatrix(true,true);point.set(0,1.2,0).applyMatrix4(blade.matrixWorld);
 // Allocate the same event bookkeeping through the regular setMusic path.
 game.setMusic({duration:9,confidence:1,bpm:null,strategy:'QA',sections:[],events:Array.from({length:7},(_,i)=>({time:3+i*.7,strength:1,confidence:1}))});
 for(let i=0;i<game.chart.length;i++){game.chart[i].x=i===0?point.x:(i%3-1)*1.5;game.chart[i].y=i===0?point.y:.5+Math.floor(i/3)*1.1;}
 clock.running=true;clock.status='playing';game.start();time=1.5;feed();time=2.5;now+=100;feed();
 if(end!=='targets'){const offset=Math.sign(point.z)*TRAVEL*(-.08+Math.sqrt(.08**2+4*.92*Math.abs(point.z)/FLIGHT_DEPTH))/(2*.92);time=3+Math.max(-HIT_WINDOW+.01,Math.min(HIT_WINDOW-.01,offset));now+=100;feed();time+=.16;feed();}
 clock.running=false;clock.status='paused';scene.renderFrame(now);result.textContent=JSON.stringify({view:end,hits:game.hits,ends:Array.from(game.hitEnds),halves:game.visuals.liveCuts*2,sparks:game.visuals.liveSparks,scope:'Same production scene, meshes and collision; synthetic observations and clock.'},null,2);
}
document.querySelector<HTMLButtonElement>('#targets')!.onclick=()=>display('targets');document.querySelector<HTMLButtonElement>('#front')!.onclick=()=>display('front');document.querySelector<HTMLButtonElement>('#rear')!.onclick=()=>display('rear');document.querySelector<HTMLButtonElement>('#sound')!.onclick=()=>{audio.setEffects(true,.3);void audio.unlock().then(()=>audio.hit(true));};
document.querySelector<HTMLButtonElement>('#run-impact')!.onclick=async()=>{const checks:string[]=[],button=document.querySelector<HTMLButtonElement>('#run-impact')!;button.disabled=true;const check=(ok:boolean,name:string)=>{if(!ok)throw Error(name);checks.push('PASS '+name);};try{
 rhythmSceneCheck(check);const geometryBefore=scene.renderer.info.memory.geometries,metrics:Record<string,unknown>={};
 for(const quality of ['medium','low'] as const){scene.setQuality(quality);display('front');clock.running=false;const metric=new Metric();const ids=game.visuals.meshes.map(m=>m.geometry.uuid);
  const current={a:new Vector3(),b:new Vector3(0,2,0),active:true},previous={a:new Vector3(-.5,0,0),b:new Vector3(-.5,2,0),active:true};
  for(let frame=0;frame<330;frame++){const start=performance.now(),t=frame/60;for(let i=0;i<12;i++)game.visuals.target(i,point.set((i%4-1.5)*.85,Math.floor(i/4)*.7,-(i%3)*2),1,t*.35,i);if(frame%12===0)for(let i=0;i<12;i++)game.visuals.split(t,point.set((i%4-1.5)*.7,Math.floor(i/4)*.6,0),i,1,0,current,previous,true,quality==='low'?4:8);
   game.visuals.update(t,quality==='low');scene.renderFrame(now);if(frame>=30)metric.add(performance.now()-start);if(frame%30===0)await new Promise(requestAnimationFrame);}
  check(game.visuals.meshes.every((m,i)=>m.geometry.uuid===ids[i]),quality+' 高密度斬裂反覆重用幾何');check(game.visuals.liveCuts<=12&&game.visuals.liveSparks<=96,quality+' 半體及火花池有界');metrics[quality]={submissionCpuMs:metric.snapshot(),drawCalls:scene.renderer.info.render.calls,triangles:scene.renderer.info.render.triangles,geometries:scene.renderer.info.memory.geometries};
 }
 check(scene.renderer.info.memory.geometries===geometryBefore,'長時間負載沒有增加 GPU 幾何');
 const offline=new OfflineAudioContext(1,48000*.25,48000),buffer=offline.createBuffer(1,48000*.18,48000);writeImpact(buffer.getChannelData(0),48000);const gain=offline.createGain();gain.gain.value=.4;gain.gain.setTargetAtTime(.1,0,HIT_GAIN_SMOOTH);gain.connect(offline.destination);for(let i=0;i<4;i++){const source=offline.createBufferSource();source.buffer=buffer;source.connect(gain);source.start();}const rendered=await offline.startRendering();let peak=0;for(const sample of rendered.getChannelData(0))peak=Math.max(peak,Math.abs(sample));metrics.impactBusFourVoicesPeak=peak;metrics.impactBusSingleVoicePeak=.72*.4;check(peak<.72*.4*1.2,'真實 OfflineAudioContext 四重命中峰值接近單次，不隨同時命中數倍增');
 const gl=scene.renderer.getContext();check(gl.getError()===gl.NO_ERROR,'新目標及分裂材質 WebGL 無錯誤');display('rear');result.textContent=JSON.stringify({checks,metrics,scope:'Synthetic high-density load, warmed CPU render submission only; not GPU completion, device FPS or tablet acceptance.'},null,2);
 }catch(error){result.textContent=JSON.stringify({checks,error:String(error)},null,2);}finally{button.disabled=false;}};
window.addEventListener('pagehide',()=>{audio.dispose();game.dispose();scene.dispose();},{once:true});display('targets');
