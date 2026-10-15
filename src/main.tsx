import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {SaberScene,type Quality} from './scene';
import {GestureGate,extendedFingers,type Side,type Point} from './gesture';
import './style.css';
type Status='idle'|'loading'|'running'|'paused'|'error';
function App(){
 const host=useRef<HTMLDivElement>(null),scene=useRef<SaberScene|null>(null),worker=useRef<Worker|null>(null),video=useRef<HTMLVideoElement|null>(null),stream=useRef<MediaStream|null>(null);
 const generation=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|null>(null),busy=useRef(false),running=useRef(false),lastFrame=useRef(-1),rate=useRef(24),lastResult=useRef(0),readyTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const gates=useRef({Left:new GestureGate(),Right:new GestureGate()});
 const [status,setStatus]=useState<Status>('idle'),[error,setError]=useState(''),[settings,setSettings]=useState(false),[quality,setQuality]=useState<Quality>('medium'),[demo,setDemo]=useState(false),[fps,setFps]=useState(0),[ms,setMs]=useState(0),[hz,setHz]=useState(0),[hands,setHands]=useState({Left:'未偵測',Right:'未偵測'});
 const samples=useRef({time:0,count:0});
 function stop(next:Status='idle'){
  generation.current++;running.current=false;if(timer.current)clearTimeout(timer.current);if(readyTimer.current)clearTimeout(readyTimer.current);
  worker.current?.terminate();worker.current=null;stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;
  if(video.current){video.current.pause();video.current.srcObject=null;video.current.remove();video.current=null;}
  busy.current=false;lastFrame.current=-1;scene.current?.hide();gates.current={Left:new GestureGate(),Right:new GestureGate()};setHands({Left:'未偵測',Right:'未偵測'});setHz(0);setStatus(next);
 }
 function fail(message:string){stop('error');setError(message);}
 useEffect(()=>{
  try{scene.current=new SaberScene(host.current!);}catch{setStatus('error');setError('無法建立 WebGL 場景。請開啟瀏覽器硬體加速，或改用支援 WebGL 的瀏覽器。');}
  const interval=setInterval(()=>{setFps(scene.current?.fps??0);if(running.current&&performance.now()-lastResult.current>220){scene.current?.hide();setHands({Left:'未偵測',Right:'未偵測'});}if(running.current&&performance.now()-lastResult.current>10000)fail('手部辨識逾時，請重新啟動攝影機。');},300);
  const visibility=()=>{if(document.hidden&&(running.current||worker.current)){stop('paused');setDemo(false);if(scene.current)scene.current.demo=false;}};
  document.addEventListener('visibilitychange',visibility);
  const pagehide=()=>stop('paused');window.addEventListener('pagehide',pagehide);
  return()=>{clearInterval(interval);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',pagehide);stop();scene.current?.dispose();};
 },[]);
 useEffect(()=>{scene.current?.setQuality(quality);rate.current=quality==='low'?18:quality==='medium'?24:30;},[quality]);
 async function start(){
  if(!scene.current)return;
  stop();setDemo(false);scene.current.demo=false;setError('');setStatus('loading');const session=generation.current;
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){fail('攝影機需要 HTTPS 或 localhost，以及支援攝影機的瀏覽器。');return;}
  try{
   const media=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:640},height:{ideal:480},frameRate:{ideal:30,max:30}}});
   if(session!==generation.current){media.getTracks().forEach(t=>t.stop());return;}
   stream.current=media;const v=document.createElement('video');v.muted=true;v.autoplay=true;v.playsInline=true;v.setAttribute('playsinline','');v.setAttribute('aria-hidden','true');v.className='tracking-video';document.body.appendChild(v);v.srcObject=media;video.current=v;
   media.getVideoTracks()[0].onended=()=>{if(session===generation.current)fail('攝影機已中斷，請重新啟動。');};
   await v.play();if(session!==generation.current)return;
   const w=new Worker(new URL('./tracker.worker.ts',import.meta.url),{type:'module'});worker.current=w;
   readyTimer.current=setTimeout(()=>{if(session===generation.current)fail('模型載入逾時，請檢查連線後重試。');},45000);
   w.onerror=()=>{if(session===generation.current)fail('辨識引擎無法啟動。請更新瀏覽器後重試。');};
   w.onmessage=({data})=>{
    if(session!==generation.current)return;
    if(data.type==='error'){fail('辨識失敗，請重新啟動。'+data.message);return;}
    if(data.type==='ready'){
     if(readyTimer.current)clearTimeout(readyTimer.current);running.current=true;lastResult.current=performance.now();samples.current={time:performance.now(),count:0};setStatus('running');capture();
    }
    if(data.type==='result'){
     busy.current=false;lastResult.current=performance.now();setMs(Math.round(data.ms));
     const labels={Left:'未偵測',Right:'未偵測'},seen=new Set<Side>();
     for(let i=0;i<data.landmarks.length;i++){
      // MediaPipe handedness assumes mirrored input. Video is raw; swap labels.
      const side:Side=data.handedness[i][0].categoryName==='Left'?'Right':'Left';
      if(seen.has(side)||data.handedness[i][0].score<.55)continue;seen.add(side);
      const p=data.landmarks[i] as Point[],count=extendedFingers(data.world[i]?.length===21?data.world[i]:p),open=gates.current[side].update(count,data.time);
      scene.current?.update({side,points:p,world:data.world[i],open,time:data.time});labels[side]=open?'光劍啟動':count<=1?'握拳收劍':'張掌啟動';
     }
     for(const side of ['Left','Right'] as Side[])if(!seen.has(side)){gates.current[side]=new GestureGate();if(scene.current)scene.current.sabers[side].active=false;}
     setHands(labels);samples.current.count++;const elapsed=performance.now()-samples.current.time;
     if(elapsed>1000){setHz(Math.round(samples.current.count*1000/elapsed));samples.current={time:performance.now(),count:0};}
    }
   };
   const base=new URL(import.meta.env.BASE_URL,location.href).href;
   w.postMessage({type:'init',base});
   async function capture(){
    if(session!==generation.current||!running.current)return;
    const started=performance.now();
    if(!busy.current&&v.readyState>=2&&v.currentTime!==lastFrame.current){
     busy.current=true;lastFrame.current=v.currentTime;
     try{const bitmap=await createImageBitmap(v);if(session!==generation.current){bitmap.close();return;}w.postMessage({type:'frame',frame:bitmap,time:performance.now()},[bitmap]);}
     catch{if(session===generation.current)fail('無法讀取攝影機影格。請使用最新版 Safari 或 Chrome。');return;}
    }
    timer.current=setTimeout(capture,Math.max(8,1000/rate.current-(performance.now()-started)));
   }
  }catch(e){if(session!==generation.current)return;const name=(e as DOMException).name;fail(name==='NotAllowedError'?'攝影機權限被拒絕。請在網址列的網站設定中允許攝影機，再重試。':name==='NotFoundError'?'找不到可用的攝影機。':name==='NotReadableError'?'攝影機被其他應用程式使用，請關閉後重試。':'無法開啟攝影機：'+String(e));}
 }
 function toggleDemo(){stop();const next=!demo;setDemo(next);if(scene.current)scene.current.demo=next;}
 const active=status==='running',loading=status==='loading';
 return <main>
  <div ref={host} className="scene" aria-label="雙光劍 3D 實驗室"/>
  <div className="vignette"/>
  <header><a className="brand" href="./"><span className="brand-icon">╱╲</span><span>GESTURE<span className="brand-light"> SABER</span><small>雙光劍自由揮劍實驗室</small></span></a><div className="header-right"><span className="phase">PHASE 01 <b> / </b> FREE PLAY</span><button className="icon-button" aria-label="開啟設定" onClick={()=>setSettings(true)}>⚙</button></div></header>
  <aside className="telemetry"><div><span className={'dot '+(active?'live':'')}/>{active?'追蹤運作中':loading?'啟動辨識引擎':demo?'視覺展示 · 非追蹤':status==='paused'?'已暫停 · 點擊重新啟動':'攝影機待命'}</div><small>{fps} FPS <span>／</span> {hz} Hz 追蹤 <span>／</span> {ms} ms 辨識</small></aside>
  {!active&&!loading&&!demo&&<section className="welcome"><div className="eyebrow">YOUR HANDS. YOUR SABERS.</div><h1>雙手，啟動原力。</h1><p>不需要 VR。張開手掌，點亮你的光劍。<br/>在眼前的空間，自由揮動。</p><div className="instructions"><span><i>✳</i> 張掌啟動</span><span><i>◉</i> 握拳收劍</span><span><i>↗</i> 揮動留下光軌</span></div><button className="primary" onClick={start}>◉ <span>{status==='paused'?'重新啟動攝影機':'開始攝影機'}</span> <span>↗</span></button><small className="privacy">影像僅在裝置上辨識，不錄影、不上傳。</small><button className="text-button" onClick={toggleDemo}>先看看光劍效果 →</button></section>}
  {loading&&<section className="loading"><div className="loader"/><h2>正在連接你的雙手</h2><p>首次啟動需要載入手部辨識模型</p><button className="text-button" onClick={()=>stop()}>取消</button></section>}
  {error&&<div className="error" role="alert">{error}</div>}
  {(active||demo)&&<div className="session-controls"><span>{demo?'視覺展示':'將雙手放在鏡頭前，張開手掌'}</span>{demo&&<button className="primary small" onClick={start}>開始攝影機</button>}<button className="secondary" onClick={()=>{stop();setDemo(false);if(scene.current)scene.current.demo=false;}}>結束{demo?'展示':'追蹤'}</button></div>}
  <footer><div className="hand left"><span className="hand-symbol">L</span><div>左手 <small>BLUE SABER</small><p>{demo?'展示中':hands.Left}</p></div></div><div className="footer-center"><span>FREE SWING LAB</span><small>建議橫向操作 · 與鏡頭保持約一臂距離</small></div><div className="hand right"><div>右手 <small>RED SABER</small><p>{demo?'展示中':hands.Right}</p></div><span className="hand-symbol">R</span></div></footer>
  {settings&&<div className="modal-backdrop" onClick={()=>setSettings(false)}><section className="settings" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={e=>e.stopPropagation()}><button autoFocus className="close icon-button" onClick={()=>setSettings(false)} aria-label="關閉設定">×</button><div className="eyebrow">LAB CONFIGURATION</div><h2 id="settings-title">實驗室設定</h2><label htmlFor="quality">畫面品質</label><select id="quality" value={quality} onChange={e=>setQuality(e.target.value as Quality)}><option value="low">省電 · 18 Hz 追蹤 / 1× 像素</option><option value="medium">平衡 · 24 Hz 追蹤 / 1.5× 像素</option><option value="high">精緻 · 30 Hz 追蹤 / 2× 像素</option></select><p>追蹤與畫面獨立更新。若平板發熱或操作卡頓，請切換省電模式。</p><button className="secondary" onClick={()=>{document.documentElement.requestFullscreen?.().catch(()=>{});}}>進入全螢幕</button><h3>操作小提示</h3><p>保持環境明亮，讓兩隻手完整入鏡。張開至少三根手指啟動；握拳收劍。手掌離開鏡頭會自動隱藏光劍。</p><p>切換分頁後會關閉攝影機，返回後請重新啟動。iPad 可使用 Safari「加入主畫面」以取得較完整的畫面。</p><button className="primary" onClick={()=>setSettings(false)}>完成設定</button></section></div>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
