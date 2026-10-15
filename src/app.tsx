import {useEffect,useRef,useState} from 'react';
import {SaberScene,type Quality} from './scene';
import {type Side} from './gesture';
import {TrackingSession,initialDiagnostics,type Diagnostics,type TrackingResult} from './tracking';
import {SaberAudio} from './audio';
import {runtimeStatus} from './runtime';
import {HandAssignment} from './hand-assignment';
import type {Summary} from './metrics';
import './style.css';
const CameraIcon=()=> <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3l1.6-2h6.8L17 7h3v12H4Z"/><circle cx="12" cy="12.5" r="3.3"/></svg>;
const SettingsIcon=()=> <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 3-.6 2.2-1.8 1L4.4 6 2.8 9l1.6 1.6v2.8L2.8 15l1.6 3 2.2-.2 1.8 1L9 21h6l.6-2.2 1.8-1 2.2.2 1.6-3-1.6-1.6v-2.8L21.2 9l-1.6-3-2.2.2-1.8-1L15 3Z"/><circle cx="12" cy="12" r="3.2"/></svg>;
const CloseIcon=()=> <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>;
type Status='idle'|'loading'|'running'|'paused'|'error';
export type SessionHandle=Pick<TrackingSession,'start'|'stop'|'setRate'|'stats'>;
type SessionFactory=(...args:ConstructorParameters<typeof TrackingSession>)=>SessionHandle;
export function App({sessionFactory=(...args)=>new TrackingSession(...args)}:{sessionFactory?:SessionFactory}){
 const host=useRef<HTMLDivElement>(null),scene=useRef<SaberScene|null>(null),session=useRef<SessionHandle|null>(null),audio=useRef<SaberAudio|null>(null),generation=useRef(0);
 const assignment=useRef(new HandAssignment()),latestDiag=useRef<Diagnostics>({...initialDiagnostics}),dialog=useRef<HTMLElement>(null),settingsButton=useRef<HTMLButtonElement>(null);

 const [poseInfo,setPoseInfo]=useState({Left:'尚未觀測',Right:'尚未觀測',identity:'等待手部'});
 const samples=useRef({time:0,count:0});
 const started=useRef(false),showMetrics=useRef(false);
 const [perf,setPerf]=useState<Record<string,Summary>>({}),[renderInfo,setRenderInfo]=useState({ratio:1,calls:0,leftTrail:0,rightTrail:0});
 const format=(name:string)=>{const s=perf[name],f=(n:number)=>n.toFixed(n<1?3:1);return s?.count?`${f(s.mean)} / ${f(s.p95)} / ${f(s.peak)} ms`:'尚無樣本';};
 const [status,setStatus]=useState<Status>('idle'),[error,setError]=useState(''),[settings,setSettings]=useState(false),[quality,setQuality]=useState<Quality>('medium'),[demo,setDemo]=useState(false),[fps,setFps]=useState(0),[hz,setHz]=useState(0);
 const [diagnostics,setDiagnostics]=useState(false),[diag,setDiag]=useState<Diagnostics>({...initialDiagnostics}),[forceMain,setForceMain]=useState(false),[sound,setSound]=useState(true),[volume,setVolume]=useState(.3),[audioStatus,setAudioStatus]=useState('等待操作啟用');
 showMetrics.current=settings&&diagnostics;
 function stop(next:Status='idle'){
  generation.current++;assignment.current.reset();session.current?.stop();session.current=null;latestDiag.current={...latestDiag.current,camera:'已釋放',model:runtimeStatus(),pipeline:'已停止（攝影機已釋放）',mode:'—'};scene.current?.hide();if(scene.current)scene.current.demo=false;
  audio.current?.dispose();audio.current=null;setAudioStatus('已停止');started.current=false;setHz(0);setStatus(next);
 }
 function unlockAudio(){
  if(!audio.current)audio.current=new SaberAudio();audio.current.configure(sound,volume);void audio.current.unlock().then(()=>setAudioStatus(audio.current?.status??'已停止'));
 }
 useEffect(()=>{
  try{scene.current=new SaberScene(host.current!,(side,active,speed,extension)=>audio.current?.update(side,active,speed,extension));}catch{setStatus('error');setError('無法建立 WebGL 場景。請使用支援 WebGL 的瀏覽器。');}
  const interval=setInterval(()=>{
   if(!showMetrics.current)return;setDiag({...latestDiag.current});
   setFps(scene.current?.fps??0);setAudioStatus(audio.current?.status??'等待操作啟用');
   if(showMetrics.current){const describe=(side:Side)=>{if(scene.current?.demo)return '展示模式：未使用手部姿態';const p=scene.current?.sabers[side].palm;return p?`方向 ${p.direction.x.toFixed(2)}, ${p.direction.y.toFixed(2)}, ${p.direction.z.toFixed(2)} · Δ ${p.deltaDegrees.toFixed(1)}° · ${p.status} · ${scene.current?.sabers[side].state.diagnostics(performance.now())}`:'尚未觀測';};setPoseInfo({Left:describe('Left'),Right:describe('Right'),identity:assignment.current.status});const all:Record<string,Summary>={};for(const [key,value] of Object.entries(scene.current?.stats??{}))all[key]=value.snapshot();for(const [key,value] of Object.entries(session.current?.stats??{}))all[key]=value.snapshot();setPerf(all);setRenderInfo({ratio:scene.current?.pixelRatio??1,calls:scene.current?.renderer.info.render.calls??0,leftTrail:scene.current?.sabers.Left.ribbon.vertices??0,rightTrail:scene.current?.sabers.Right.ribbon.vertices??0});}
  },500);
  const pause=()=>{stop('paused');setDemo(false);};const visibility=()=>{if(document.hidden)pause();};
  document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',pause);
  return()=>{clearInterval(interval);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',pause);stop();scene.current?.dispose();};
 },[]);
 useEffect(()=>{scene.current?.setQuality(quality);session.current?.setRate(quality==='low'?18:quality==='medium'?24:30);},[quality]);
 useEffect(()=>{audio.current?.configure(sound,volume);},[sound,volume]);
 function receive(data:TrackingResult){
  if(!started.current){started.current=true;setStatus('running');}
  let left=false,right=false;
  for(const {side,index:i} of assignment.current.assign(data)){
   scene.current?.update({side,points:data.landmarks[i],world:data.world[i],open:true,time:data.time,imageAspect:data.aspect});
   if(side==='Left')left=true;else right=true;
  }
  for(const side of ['Left','Right'] as Side[])if(!(side==='Left'?left:right))scene.current?.lost(side,data.time,data.landmarks.length?'模型回傳 '+data.landmarks.length+' 隻，該手未配對：'+assignment.current.status:'MediaPipe 未回傳手部');
  samples.current.count++;const elapsed=performance.now()-samples.current.time;
  if(elapsed>1000){if(showMetrics.current)setHz(Math.round(samples.current.count*1000/elapsed));samples.current={time:performance.now(),count:0};}
 }
 function start(){
  if(!scene.current)return;stop();unlockAudio();setDemo(false);setError('');setStatus('loading');latestDiag.current={...initialDiagnostics};setDiag({...initialDiagnostics});samples.current={time:performance.now(),count:0};const id=generation.current;
  const next=sessionFactory(new URL(import.meta.env.BASE_URL,location.origin).href,d=>{if(id===generation.current)latestDiag.current=d;},r=>{if(id===generation.current)receive(r);},message=>{if(id!==generation.current)return;setStatus('error');setError(message);latestDiag.current={...latestDiag.current,camera:'已釋放',detail:message};scene.current?.hide();audio.current?.dispose();audio.current=null;});
  session.current=next;next.setRate(quality==='low'?18:quality==='medium'?24:30);void next.start(forceMain);
 }
 function toggleDemo(){stop();const next=!demo;setDemo(next);setError('');if(next)unlockAudio();if(scene.current)scene.current.demo=next;}
 function changeSound(enabled:boolean){setSound(enabled);if(!audio.current)audio.current=new SaberAudio();audio.current.configure(enabled,volume);if(enabled)void audio.current.unlock().then(()=>setAudioStatus(audio.current?.status??'已停止'));else setAudioStatus('已靜音');}
 const active=status==='running',loading=status==='loading';
 function closeSettings(){setSettings(false);queueMicrotask(()=>settingsButton.current?.focus());}
 function cameraToggle(){if(active||loading){stop();setDemo(false);}else start();}
 function trapFocus(e:React.KeyboardEvent<HTMLElement>){
  if(e.key==='Escape'){closeSettings();return;}
  if(e.key!=='Tab')return;
  const items=dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]');if(!items?.length)return;
  const first=items[0],last=items[items.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
 }
 async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else setError('此瀏覽器未提供全螢幕控制。');}catch{setError('無法切換全螢幕，請再試一次。');}}
 return <main>
  <div ref={host} className="scene" aria-label="雙光劍 3D 場景"/>
  <header className="topbar"><h1>Gesture Saber</h1><nav aria-label="實驗室控制">
   <button className={'icon-button camera '+(loading?'is-loading':active?'is-active':'')} aria-label={loading?'取消攝影機載入':active?'停止攝影機':'開始攝影機'} title={loading?'取消載入':active?'停止攝影機':'開始攝影機'} aria-pressed={active||loading} onClick={cameraToggle}><CameraIcon/><span className="camera-indicator" aria-hidden="true"/></button>
   <button ref={settingsButton} className="icon-button" aria-label="開啟設定" title="設定" aria-haspopup="dialog" aria-expanded={settings} onClick={()=>setSettings(true)}><SettingsIcon/></button>
  </nav></header>
  {error&&<div className="error-toast" role="alert"><p>{error}</p><button className="icon-button" aria-label="關閉錯誤提示" onClick={()=>setError('')}><CloseIcon/></button></div>}
  {settings&&<div className="modal-backdrop" onClick={closeSettings}><section ref={dialog} className="settings" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={e=>e.stopPropagation()} onKeyDown={trapFocus}>
   <div className="panel-heading"><h2 id="settings-title">設定</h2><button autoFocus className="icon-button" aria-label="關閉設定" onClick={closeSettings}><CloseIcon/></button></div>
   <section className="setting-group"><h3>音樂</h3><p>尚未提供音樂播放功能。</p></section>
   <section className="setting-group"><h3>光劍音效</h3><label className="check-row"><input type="checkbox" checked={sound} onChange={e=>changeSound(e.target.checked)}/>啟用音效</label><label htmlFor="volume">音量 <output>{Math.round(volume*100)}%</output></label><input id="volume" type="range" min="0" max="1" step=".01" value={volume} onChange={e=>setVolume(Number(e.target.value))}/><p>{audioStatus}</p></section>
   <section className="setting-group"><h3>畫面與效能</h3><label htmlFor="quality">畫面品質</label><select id="quality" value={quality} onChange={e=>setQuality(e.target.value as Quality)}><option value="low">省電 · 18 Hz / 最高 1×</option><option value="medium">平衡 · 24 Hz / 最高 1.4×</option><option value="high">精緻 · 30 Hz / 最高 1.8×</option></select><p>自適應解析度已啟用；優先保留追蹤反應。</p><button className="secondary" onClick={()=>void fullscreen()}>切換全螢幕</button></section>
   <section className="setting-group"><h3>攝影機與診斷</h3><label className="check-row"><input type="checkbox" checked={forceMain} onChange={e=>setForceMain(e.target.checked)}/>下次啟動使用相容辨識模式</label><p>預設嘗試 Worker，失敗時自動切換主執行緒。切換分頁會釋放攝影機；回來後可重新開啟。</p><label className="check-row"><input type="checkbox" checked={diagnostics} onChange={e=>setDiagnostics(e.target.checked)}/>顯示詳細診斷</label>
{diagnostics&&<div className="diagnostics" aria-label="追蹤診斷"><dl>
   <dt>攝影機</dt><dd>{diag.camera}</dd><dt>模型／WASM</dt><dd>{diag.model}</dd><dt>辨識模式</dt><dd>{diag.mode}</dd><dt>管線</dt><dd>{diag.pipeline}</dd><dt>已處理影格</dt><dd>{diag.frames}</dd><dt>渲染 FPS</dt><dd>{perf.frame?.mean?(1000/perf.frame.mean).toFixed(1):fps}</dd><dt>追蹤 Hz</dt><dd>{perf.interval?.mean?(1000/perf.interval.mean).toFixed(1):hz}</dd><dt>攝影機解碼</dt><dd>{perf.cameraInterval?.mean?`${(1000/perf.cameraInterval.mean).toFixed(1)} Hz`:'瀏覽器未提供樣本'}</dd>
   <dt>解碼幀間隔</dt><dd>{format('cameraInterval')}</dd><dt>追蹤間隔</dt><dd>{format('interval')}</dd><dt>擷取／轉換</dt><dd>{format('capture')}</dd><dt>推論</dt><dd>{format('inference')}</dd><dt>結果送達延遲</dt><dd>{format('delivery')}</dd><dt>資料→畫面估計</dt><dd>{format('age')}</dd><dt>平滑落後估計</dt><dd>{format('smoothing')}</dd><dt>渲染幀間隔</dt><dd>{format('frame')}</dd><dt>CPU 幀工作</dt><dd>{format('cpu')}</dd><dt>單劍光軌 CPU</dt><dd>{format('trail')}</dd><dt>單劍音訊 CPU</dt><dd>{format('audio')}</dd><dt>光軌頂點 藍／紅</dt><dd>{renderInfo.leftTrail} / {renderInfo.rightTrail}</dd><dt>實際像素比</dt><dd>{renderInfo.ratio.toFixed(2)}× · {renderInfo.calls} draw calls</dd><dt>左手姿態</dt><dd>{poseInfo.Left}</dd><dt>右手姿態</dt><dd>{poseInfo.Right}</dd><dt>身分配對</dt><dd>{poseInfo.identity}</dd><dt>音訊</dt><dd>{audioStatus} · Phase 1.1 原始合成</dd></dl>
   <p>{diag.detail||'啟動攝影機後會顯示實際追蹤資料；展示模式不代表實機追蹤。'}</p><small>時間依序為平均 / P95 / 峰值（最近最多 240 筆）。每 500 ms 更新。資料延遲從取樣時計算，非完整攝影機到螢幕延遲。CPU 提交時間不代表 GPU 執行時間；GPU 未直接量測。</small></div>}

   </section>
   <section className="setting-group"><h3>開發與測試</h3><button className="secondary" aria-pressed={demo} onClick={toggleDemo}>{demo?'停止展示':'光劍與音效展示'}</button><p>展示使用模擬動作，不代表攝影機追蹤結果。</p></section>
  </section></div>}
 </main>;
}
