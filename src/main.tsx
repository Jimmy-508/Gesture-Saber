import {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {SaberScene,type Quality} from './scene';
import {GestureGate,extendedFingers,type Side} from './gesture';
import {TrackingSession,initialDiagnostics,type Diagnostics,type TrackingResult} from './tracking';
import {SaberAudio} from './audio';
import type {Summary} from './metrics';
import './style.css';
type Status='idle'|'loading'|'running'|'paused'|'error';
function App(){
 const host=useRef<HTMLDivElement>(null),scene=useRef<SaberScene|null>(null),session=useRef<TrackingSession|null>(null),audio=useRef<SaberAudio|null>(null),generation=useRef(0);
 const gates=useRef({Left:new GestureGate(),Right:new GestureGate()}),samples=useRef({time:0,count:0});
 const handLabels=useRef({Left:'未偵測',Right:'未偵測'}),latestMs=useRef(0),started=useRef(false),showMetrics=useRef(false);
 const [perf,setPerf]=useState<Record<string,Summary>>({}),[renderInfo,setRenderInfo]=useState({ratio:1,calls:0,leftTrail:0,rightTrail:0});
 const format=(name:string)=>{const s=perf[name],f=(n:number)=>n.toFixed(n<1?3:1);return s?.count?`${f(s.mean)} / ${f(s.p95)} / ${f(s.peak)} ms`:'尚無樣本';};
 const [status,setStatus]=useState<Status>('idle'),[error,setError]=useState(''),[settings,setSettings]=useState(false),[quality,setQuality]=useState<Quality>('medium'),[demo,setDemo]=useState(false),[fps,setFps]=useState(0),[ms,setMs]=useState(0),[hz,setHz]=useState(0),[hands,setHands]=useState({Left:'未偵測',Right:'未偵測'});
 const [diagnostics,setDiagnostics]=useState(false),[diag,setDiag]=useState<Diagnostics>({...initialDiagnostics}),[forceMain,setForceMain]=useState(false),[sound,setSound]=useState(true),[volume,setVolume]=useState(.3),[audioStatus,setAudioStatus]=useState('等待操作啟用');
 showMetrics.current=diagnostics;
 function stop(next:Status='idle'){
  generation.current++;session.current?.stop();session.current=null;scene.current?.hide();if(scene.current)scene.current.demo=false;
  audio.current?.dispose();audio.current=null;setAudioStatus('已停止');gates.current={Left:new GestureGate(),Right:new GestureGate()};handLabels.current={Left:'未偵測',Right:'未偵測'};started.current=false;latestMs.current=0;setHands(handLabels.current);setHz(0);setStatus(next);
 }
 function unlockAudio(){
  if(!audio.current)audio.current=new SaberAudio();audio.current.configure(sound,volume);void audio.current.unlock().then(()=>setAudioStatus(audio.current?.status??'已停止'));
 }
 useEffect(()=>{
  try{scene.current=new SaberScene(host.current!,(side,active,speed,extension)=>audio.current?.update(side,active,speed,extension));}catch{setStatus('error');setError('無法建立 WebGL 場景。請使用支援 WebGL 的瀏覽器。');}
  const interval=setInterval(()=>{
   setFps(scene.current?.fps??0);setMs(Math.round(latestMs.current));setHands(handLabels.current);setAudioStatus(audio.current?.status??'等待操作啟用');
   if(showMetrics.current){const all:Record<string,Summary>={};for(const [key,value] of Object.entries(scene.current?.stats??{}))all[key]=value.snapshot();for(const [key,value] of Object.entries(session.current?.stats??{}))all[key]=value.snapshot();setPerf(all);setRenderInfo({ratio:scene.current?.pixelRatio??1,calls:scene.current?.renderer.info.render.calls??0,leftTrail:scene.current?.sabers.Left.ribbon.vertices??0,rightTrail:scene.current?.sabers.Right.ribbon.vertices??0});}
  },500);
  const pause=()=>{stop('paused');setDemo(false);};const visibility=()=>{if(document.hidden)pause();};
  document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',pause);
  return()=>{clearInterval(interval);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',pause);stop();scene.current?.dispose();};
 },[]);
 useEffect(()=>{scene.current?.setQuality(quality);session.current?.setRate(quality==='low'?18:quality==='medium'?24:30);},[quality]);
 useEffect(()=>{audio.current?.configure(sound,volume);},[sound,volume]);
 function receive(data:TrackingResult){
  if(!started.current){started.current=true;setStatus('running');}latestMs.current=data.ms;const labels={Left:'未偵測',Right:'未偵測'},seen=new Set<Side>();
  for(let i=0;i<data.landmarks.length;i++){
   const hand=data.handedness[i]?.[0];if(!hand||hand.score<.55)continue;
   const side:Side=hand.categoryName==='Left'?'Right':'Left';if(seen.has(side))continue;seen.add(side);
   const p=data.landmarks[i],count=extendedFingers(data.world[i]?.length===21?data.world[i]:p),open=gates.current[side].update(count,data.time);
   scene.current?.update({side,points:p,world:data.world[i],open,time:data.time});labels[side]=open?'光劍啟動':count<=1?'握拳收劍':'張掌啟動';
  }
  // Keep gate state over a short occlusion; BladeState independently retracts after 260 ms.
  handLabels.current=labels;samples.current.count++;const elapsed=performance.now()-samples.current.time;
  if(elapsed>1000){setHz(Math.round(samples.current.count*1000/elapsed));samples.current={time:performance.now(),count:0};}
 }
 function start(){
  if(!scene.current)return;stop();unlockAudio();setDemo(false);setError('');setStatus('loading');setDiag({...initialDiagnostics});samples.current={time:performance.now(),count:0};const id=generation.current;
  const next=new TrackingSession(new URL(import.meta.env.BASE_URL,location.origin).href,d=>{if(id===generation.current)setDiag(d);},r=>{if(id===generation.current)receive(r);},message=>{if(id!==generation.current)return;setStatus('error');setError(message);scene.current?.hide();audio.current?.dispose();audio.current=null;});
  session.current=next;next.setRate(quality==='low'?18:quality==='medium'?24:30);void next.start(forceMain);
 }
 function toggleDemo(){stop();const next=!demo;setDemo(next);setError('');if(next)unlockAudio();if(scene.current)scene.current.demo=next;}
 function changeSound(enabled:boolean){setSound(enabled);if(!audio.current)audio.current=new SaberAudio();audio.current.configure(enabled,volume);if(enabled)void audio.current.unlock().then(()=>setAudioStatus(audio.current?.status??'已停止'));else setAudioStatus('已靜音');}
 const active=status==='running',loading=status==='loading';
 return <main>
  <div ref={host} className="scene" aria-label="雙光劍 3D 實驗室"/><div className="vignette"/>
  <header><a className="brand" href="./"><span className="brand-icon">╱╲</span><span>GESTURE<span className="brand-light"> SABER</span><small>雙光劍自由揮劍實驗室</small></span></a><div className="header-right"><span className="phase">PHASE 01.2 <b> / </b> ENERGY IN MOTION</span><button className="icon-button" aria-label={sound?'關閉音效':'開啟音效'} onClick={()=>changeSound(!sound)}>{sound?'♫':'♪'}</button><button className="icon-button" aria-label="開啟設定" onClick={()=>setSettings(true)}>⚙</button></div></header>
  <aside className="telemetry"><div><span className={'dot '+(active?'live':'')}/>{active?'追蹤運作中':loading?diag.camera.startsWith('可讀')?'攝影機已開啟 · 辨識初始化中':'等待攝影機':demo?'視覺與合成音效展示':status==='paused'?'已暫停 · 點擊重新啟動':'攝影機待命'}</div><small>{fps} FPS <span>／</span> {hz} Hz 追蹤 <span>／</span> {ms} ms 辨識</small><button className="text-button diagnostic-toggle" onClick={()=>setDiagnostics(!diagnostics)} aria-expanded={diagnostics}>診斷資訊 {diagnostics?'−':'+'}</button></aside>
  {diagnostics&&<aside className="diagnostics" aria-label="追蹤診斷"><strong>PIPELINE DIAGNOSTICS · 1.2</strong><dl>
   <dt>攝影機</dt><dd>{diag.camera}</dd><dt>模型</dt><dd>{diag.model}</dd><dt>辨識模式</dt><dd>{diag.mode}</dd><dt>已處理影格</dt><dd>{diag.frames}</dd><dt>渲染 FPS</dt><dd>{perf.frame?.mean?(1000/perf.frame.mean).toFixed(1):fps}</dd><dt>追蹤 Hz</dt><dd>{perf.interval?.mean?(1000/perf.interval.mean).toFixed(1):hz}</dd><dt>攝影機解碼</dt><dd>{perf.cameraInterval?.mean?`${(1000/perf.cameraInterval.mean).toFixed(1)} Hz`:'瀏覽器未提供樣本'}</dd>
   <dt>解碼幀間隔</dt><dd>{format('cameraInterval')}</dd><dt>追蹤間隔</dt><dd>{format('interval')}</dd><dt>擷取／轉換</dt><dd>{format('capture')}</dd><dt>推論</dt><dd>{format('inference')}</dd><dt>結果送達延遲</dt><dd>{format('delivery')}</dd><dt>資料→畫面估計</dt><dd>{format('age')}</dd><dt>平滑落後估計</dt><dd>{format('smoothing')}</dd><dt>渲染幀間隔</dt><dd>{format('frame')}</dd><dt>CPU 幀工作</dt><dd>{format('cpu')}</dd><dt>單劍光軌 CPU</dt><dd>{format('trail')}</dd><dt>單劍音訊 CPU</dt><dd>{format('audio')}</dd><dt>光軌頂點 藍／紅</dt><dd>{renderInfo.leftTrail} / {renderInfo.rightTrail}</dd><dt>實際像素比</dt><dd>{renderInfo.ratio.toFixed(2)}× · {renderInfo.calls} draw calls</dd><dt>音訊</dt><dd>{audioStatus}</dd></dl>
   <p>{diag.detail||'啟動攝影機後會顯示實際追蹤資料；展示模式不代表實機追蹤。'}</p><small>時間依序為平均 / P95 / 峰值（最近最多 240 筆）。每 500 ms 更新。資料延遲從取樣時計算，非完整攝影機到螢幕延遲。CPU 提交時間不代表 GPU 執行時間；GPU 未直接量測。</small></aside>}
  {!active&&!loading&&!demo&&<section className="welcome"><div className="eyebrow">YOUR HANDS. YOUR SABERS.</div><h1>雙手，啟動原力。</h1><p>不需要 VR。張開手掌，點亮你的光劍。<br/>感受每次揮動的能量與聲音。</p><div className="instructions"><span><i>✳</i> 張掌啟動</span><span><i>◉</i> 握拳收劍</span><span><i>↗</i> 揮動能量</span></div><button className="primary" onClick={start}>◉ <span>{status==='paused'?'重新啟動攝影機':'開始攝影機'}</span><span>↗</span></button><small className="privacy">影像僅在裝置上辨識，不錄影、不上傳。</small><button className="text-button" onClick={toggleDemo}>體驗光劍與動態音效 →</button></section>}
  {loading&&<section className="loading"><div className="loader"/><h2>{diag.camera.startsWith('可讀')?'攝影機已開啟':'正在開啟攝影機'}</h2><p>{diag.camera.startsWith('可讀')?diag.model:'請允許前置鏡頭權限；影像不會顯示在遊戲畫面。'}</p><button className="text-button" onClick={()=>stop()}>取消並釋放攝影機</button></section>}
  {error&&<div className="error" role="alert">{error}</div>}
  {(active||demo)&&<div className="session-controls"><span>{demo?'光劍與音效展示 · 非追蹤':'將雙手放在鏡頭前，張開手掌'}</span>{demo&&<button className="primary small" onClick={start}>開始攝影機</button>}<button className="secondary" onClick={()=>{stop();setDemo(false);}}>結束{demo?'展示':'追蹤'}</button></div>}
  <footer><div className="hand left"><span className="hand-symbol">L</span><div>左手 <small>BLUE SABER</small><p>{demo?'展示中':hands.Left}</p></div></div><div className="footer-center"><span>ENERGY IN MOTION</span><small>建議橫向操作 · 與鏡頭保持約一臂距離</small></div><div className="hand right"><div>右手 <small>RED SABER</small><p>{demo?'展示中':hands.Right}</p></div><span className="hand-symbol">R</span></div></footer>
  {settings&&<div className="modal-backdrop" onClick={()=>setSettings(false)}><section className="settings" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape')setSettings(false);}}><button autoFocus className="close icon-button" onClick={()=>setSettings(false)} aria-label="關閉設定">×</button><div className="eyebrow">LAB CONFIGURATION</div><h2 id="settings-title">實驗室設定</h2>
   <label htmlFor="quality">畫面品質</label><select id="quality" value={quality} onChange={e=>setQuality(e.target.value as Quality)}><option value="low">省電 · 18 Hz 目標追蹤 / 最高 1×</option><option value="medium">平衡 · 24 Hz 目標追蹤 / 最高 1.4×</option><option value="high">精緻 · 30 Hz 目標追蹤 / 最高 1.8×</option></select><p>像素比依持續幀時間緩慢調整，至少間隔 8 秒。平衡模式保留核心與光暈，關閉額外動態點光源。追蹤頻率不隨畫質自動降低。</p>
   <label className="check-row"><input type="checkbox" checked={sound} onChange={e=>changeSound(e.target.checked)}/>原創合成光劍音效</label><label htmlFor="volume">音量 {Math.round(volume*100)}%</label><input id="volume" type="range" min="0" max="1" step=".01" value={volume} onChange={e=>setVolume(Number(e.target.value))}/><p>{audioStatus} · 在 iPad 上請點擊開啟音效，並確認系統音量。</p>
   <label className="check-row"><input type="checkbox" checked={diagnostics} onChange={e=>setDiagnostics(e.target.checked)}/>顯示攝影機與辨識診斷</label><label className="check-row"><input type="checkbox" checked={forceMain} onChange={e=>setForceMain(e.target.checked)}/>下次啟動直接使用相容辨識模式</label><p>預設自動嘗試 Worker，失敗後切換備援。若特定平板一直無法追蹤，可勾選相容模式後重新啟動。</p>
   <button className="secondary" onClick={()=>{document.documentElement.requestFullscreen?.().catch(()=>{});}}>進入全螢幕</button><h3>操作小提示</h3><p>環境保持明亮，兩隻手完整入鏡。張掌啟動；握拳收劍。短暫遮擋有緩衝，持續離鏡會收劍。切換分頁會關閉攝影機及音訊，返回後重新啟動。</p><button className="primary" onClick={()=>setSettings(false)}>完成設定</button></section></div>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
