import {useEffect,useRef,useState} from 'react';
import {SaberScene,type Quality} from './scene';
import {TrackingSession,initialDiagnostics,type Diagnostics,type TrackingResult} from './tracking';
import {SaberAudio} from './audio';
import {runtimeStatus} from './runtime';
import type {Summary} from './metrics';
import type {ControlMode} from './control-core';
import {type RawHand} from './control-identity';
import {observeHand} from './hand-presence';
import './style.css';
const CameraIcon=()=> <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3l1.6-2h6.8L17 7h3v12H4Z"/><circle cx="12" cy="12.5" r="3.3"/></svg>;
const SettingsIcon=()=> <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 3-.6 2.2-1.8 1L4.4 6 2.8 9l1.6 1.6v2.8L2.8 15l1.6 3 2.2-.2 1.8 1L9 21h6l.6-2.2 1.8-1 2.2.2 1.6-3-1.6-1.6v-2.8L21.2 9l-1.6-3-2.2.2-1.8-1L15 3Z"/><circle cx="12" cy="12" r="3.2"/></svg>;
const CloseIcon=()=> <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>;
type Status='idle'|'loading'|'running'|'paused'|'error';
export type SessionHandle=Pick<TrackingSession,'start'|'stop'|'setRate'|'stats'>;
type SessionFactory=(...args:ConstructorParameters<typeof TrackingSession>)=>SessionHandle;
function savedMapping():RawHand{try{return localStorage.getItem('gesture-saber-left-label')==='Left'?'Left':'Right';}catch{return 'Right';}}
export function App({sessionFactory=(...args)=>new TrackingSession(...args),onSceneReady}:{sessionFactory?:SessionFactory;onSceneReady?:(scene:SaberScene)=>void}){
 const host=useRef<HTMLDivElement>(null),scene=useRef<SaberScene|null>(null),session=useRef<SessionHandle|null>(null),audio=useRef<SaberAudio|null>(null),generation=useRef(0);
 const latestDiag=useRef<Diagnostics>({...initialDiagnostics}),dialog=useRef<HTMLElement>(null),settingsButton=useRef<HTMLButtonElement>(null);

 const [weaponInfo,setWeaponInfo]=useState('等待主控手');
 const samples=useRef({time:0,count:0});
 const lastContext=useRef({modelHands:0,identity:'等待手部',details:[] as string[],mode:'—'}),sessionClock=useRef({start:null as number|null,end:null as number|null}),lastTracking=useRef<Record<string,Summary>>({});
 const started=useRef(false),showMetrics=useRef(false);
 const [summary,setSummary]=useState('');
 const [perf,setPerf]=useState<Record<string,Summary>>({}),[renderInfo,setRenderInfo]=useState({ratio:1,calls:0,leftTrail:0,rightTrail:0});
 const format=(name:string)=>{const s=perf[name],f=(n:number)=>n.toFixed(n<1?3:1);return s?.count?`${f(s.mean)} / ${f(s.p95)} / ${f(s.peak)} ms`:'尚無樣本';};
 const [status,setStatus]=useState<Status>('idle'),[error,setError]=useState(''),[settings,setSettings]=useState(false),[quality,setQuality]=useState<Quality>('medium'),[demo,setDemo]=useState(false),[fps,setFps]=useState(0),[hz,setHz]=useState(0);
 const [diagnostics,setDiagnostics]=useState(false),[diag,setDiag]=useState<Diagnostics>({...initialDiagnostics}),[forceMain,setForceMain]=useState(false),[sound,setSound]=useState(true),[volume,setVolume]=useState(.3),[audioStatus,setAudioStatus]=useState('等待操作啟用');
 const [coreMode,setCoreMode]=useState<ControlMode>('modern'),[leftLabel,setLeftLabel]=useState<RawHand>(savedMapping),[calibrationMessage,setCalibrationMessage]=useState('');
 const calibration=useRef<{label:string;count:number}|null>(null);
 showMetrics.current=settings&&diagnostics;
 function stop(next:Status='idle'){
  calibration.current=null;setCalibrationMessage('');
  if(sessionClock.current.start!==null&&sessionClock.current.end===null)sessionClock.current.end=performance.now();if(session.current)lastTracking.current=Object.fromEntries(Object.entries(session.current.stats).map(([k,m])=>[k,m.snapshot()]));
  generation.current++;session.current?.stop();session.current=null;latestDiag.current={...latestDiag.current,camera:'已釋放',model:runtimeStatus(),pipeline:'已停止（攝影機已釋放）',mode:'—'};scene.current?.hide();if(scene.current)scene.current.demo=false;
  audio.current?.pause(next==='paused');setAudioStatus('已暫停（音訊可重用）');started.current=false;setHz(0);setStatus(next);
 }
 function unlockAudio(){
  if(!audio.current)audio.current=new SaberAudio();audio.current.configure(sound,volume);void audio.current.unlock().then(()=>setAudioStatus(audio.current?.status??'已停止'));
 }
 useEffect(()=>{
  try{scene.current=new SaberScene(host.current!,(side,active,speed,extension)=>audio.current?.update(side,active,speed,extension),true,()=>performance.now());scene.current.setControlMode('modern');scene.current.control.setLeftLabel(leftLabel);onSceneReady?.(scene.current);}catch{setStatus('error');setError('無法建立 WebGL 場景。請使用支援 WebGL 的瀏覽器。');}
  const interval=setInterval(()=>{
   if(!showMetrics.current)return;const now=performance.now();setDiag({...latestDiag.current});
   setFps(scene.current?.fps??0);setAudioStatus(audio.current?.status??'等待操作啟用');
   const current=scene.current;if(current){const c=current.control.snapshot(now);setWeaponInfo(current.demo?'展示模式：合成單刃／金色雙頭動作，未使用攝影機':`主控 ${c.primary??'無'} · ${c.twin?'金色雙頭':'單刃'} · ${c.gesture} · ${c.armed?'可觸發':'等待解除'} · ${current.weapon.state.diagnostics(now)} · ${c.identity}`);const all:Record<string,Summary>={};for(const [key,value] of Object.entries(current.stats))all[key]=value.snapshot();for(const [key,value] of Object.entries(session.current?.stats??{}))all[key]=value.snapshot();setPerf(all);setRenderInfo({ratio:current.pixelRatio,calls:current.renderer.info.render.calls,leftTrail:current.weapon.ribbon.vertices,rightTrail:current.weapon.rearRibbon.vertices});}
  },500);
  const pause=()=>{stop('paused');setDemo(false);};const leave=()=>{pause();audio.current?.dispose();audio.current=null;};const visibility=()=>{if(document.hidden)pause();};
  document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',leave);
  return()=>{clearInterval(interval);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',leave);stop();audio.current?.dispose();audio.current=null;scene.current?.dispose();};
 },[]);
 useEffect(()=>{scene.current?.setQuality(quality);session.current?.setRate(quality==='low'?18:quality==='medium'?24:30);},[quality]);
 useEffect(()=>{audio.current?.configure(sound,volume);},[sound,volume]);
 function receive(data:TrackingResult){
  if(scene.current&&data.time<scene.current.controlEpoch)return;
  if(calibration.current&&scene.current){
   const label=data.handedness[0]?.[0],c=calibration.current;
   if(data.landmarks.length===1&&observeHand(data.landmarks[0])&&(label?.categoryName==='Left'||label?.categoryName==='Right')&&label.score>=.7){c.count=c.label===label.categoryName?c.count+1:1;c.label=label.categoryName;}else c.count=0;
   if(c.count>=6){const raw=c.label as RawHand;calibration.current=null;scene.current.hide();scene.current.control.setLeftLabel(raw);scene.current.controlEpoch=performance.now();setLeftLabel(raw);try{localStorage.setItem('gesture-saber-left-label',raw);}catch{}setCalibrationMessage('校正完成：實際左手藍劍、實際右手紅劍。');return;}
  }
  if(!started.current){started.current=true;setStatus('running');}
  scene.current?.receiveControls(data);const id=scene.current?.control.identity;if(id)lastContext.current={modelHands:data.landmarks.length,identity:id.status,details:id.details,mode:latestDiag.current.mode};
  samples.current.count++;const elapsed=performance.now()-samples.current.time;
  if(elapsed>1000){if(showMetrics.current)setHz(Math.round(samples.current.count*1000/elapsed));samples.current={time:performance.now(),count:0};}
 }
 function start(){
  if(!scene.current)return;stop();scene.current.weapon.telemetry.reset();setSummary('');unlockAudio();setDemo(false);setError('');setStatus('loading');latestDiag.current={...initialDiagnostics};setDiag({...initialDiagnostics});samples.current={time:performance.now(),count:0};const id=generation.current;
  sessionClock.current={start:performance.now(),end:null};lastContext.current={modelHands:0,identity:'等待手部',details:[],mode:'—'};lastTracking.current={};
  const next=sessionFactory(new URL(import.meta.env.BASE_URL,location.origin).href,d=>{if(id===generation.current)latestDiag.current=d;},r=>{if(id===generation.current)receive(r);},message=>{if(id!==generation.current)return;sessionClock.current.end=performance.now();setStatus('error');setError(message);latestDiag.current={...latestDiag.current,camera:'已釋放',detail:message};scene.current?.hide();audio.current?.pause();});
  session.current=next;next.setRate(quality==='low'?18:quality==='medium'?24:30);void next.start(forceMain);
 }
 function toggleDemo(){stop();const next=!demo;setDemo(next);setError('');if(next)unlockAudio();if(scene.current)scene.current.demo=next;}
 function changeCore(mode:ControlMode){calibration.current=null;setCalibrationMessage('');setCoreMode(mode);scene.current?.setControlMode(mode);if(scene.current)scene.current.demo=false;lastContext.current={modelHands:0,identity:'核心切換：等待觀測',details:[],mode:latestDiag.current.mode};setDemo(false);setSummary('');setPerf({});}
 function calibrate(){if(calibration.current){calibration.current=null;setCalibrationMessage('已取消校正。');}else{calibration.current={label:'',count:0};setCalibrationMessage('請只伸入實際左手，保持片刻；右手留在鏡頭外。再次點擊可取消。');}}
 function changeSound(enabled:boolean){setSound(enabled);if(!audio.current)audio.current=new SaberAudio();audio.current.configure(enabled,volume);if(enabled)void audio.current.unlock().then(()=>setAudioStatus(audio.current?.status??'已停止'));else{audio.current.pause();setAudioStatus('已靜音');}}
 const active=status==='running',loading=status==='loading';
 function closeSettings(){setSettings(false);queueMicrotask(()=>settingsButton.current?.focus());}
 function cameraToggle(){if(active||loading){stop();setDemo(false);}else start();}
 function trapFocus(e:React.KeyboardEvent<HTMLElement>){
  if(e.key==='Escape'){closeSettings();return;}
  if(e.key!=='Tab')return;
  const items=dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea,select:not(:disabled),a[href]');if(!items?.length)return;
  const first=items[0],last=items[items.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
 }
 function copyStats(){const now=performance.now(),clock=sessionClock.current;const text=JSON.stringify({version:'1.8.1',controlMode:scene.current?.controlMode,control:scene.current?.control.snapshot(now),generatedAt:new Date().toISOString(),sessionMs:clock.start===null?0:Math.max(0,(clock.end??now)-clock.start),demo:scene.current?.demo??false,mapping:scene.current?.controlMode==='modern'?'raw '+leftLabel+' → blue / Left; calibrated physical left → blue, right → red; uncalibrated mapping retains 1.5.3':'legacy with input calibration: raw '+leftLabel+' → blue / Left',latestResult:lastContext.current,pipeline:latestDiag.current,quality,render:perf.frame,cpu:perf.cpu,tracking:session.current?Object.fromEntries(Object.entries(session.current.stats).map(([k,m])=>[k,m.snapshot()])):lastTracking.current,weapon:scene.current?.weapon.telemetry.snapshot(now),audio:{preparation:audio.current?.preparation,scheduledCalls:audio.current?.scheduledCalls,skippedUpdates:audio.current?.skippedUpdates,skippedParameters:audio.current?.skippedParameters},warmup:scene.current?.warmup},null,2);setSummary(text);void navigator.clipboard?.writeText(text).catch(()=>{});}
 async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else setError('此瀏覽器未提供全螢幕控制。');}catch{setError('無法切換全螢幕，請再試一次。');}}
 return <main>
  <div ref={host} className="scene" aria-label="變形光劍 3D 場景"/>
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
   <section className="setting-group"><h3>手部控制</h3><label htmlFor="control-core">控制核心</label><select id="control-core" value={coreMode} onChange={e=>changeCore(e.target.value as ControlMode)}><option value="modern">新版控制核心（預設）</option><option value="legacy">舊版姿態核心（回退）</option></select><p>第一隻手控制一把光劍；雙手握拳靠攏片刻可切換金色雙頭。先分開或鬆拳，再靠攏可切回。兩種核心皆控制同一把武器；切換核心會清除主控手與型態，攝影機保持運作。</p><><button className="secondary" disabled={!active} onClick={calibrate}>用實際左手校正</button><p>{calibrationMessage||'左手藍、右手紅。若顏色相反，啟動攝影機後，只伸入實際左手進行校正。未校正前沿用 1.5.3 映射。'}</p></></section>
   <section className="setting-group"><h3>攝影機與診斷</h3><label className="check-row"><input type="checkbox" checked={forceMain} onChange={e=>setForceMain(e.target.checked)}/>下次啟動使用相容辨識模式</label><p>預設嘗試 Worker，失敗時自動切換主執行緒。切換分頁會釋放攝影機；回來後可重新開啟。</p><label className="check-row"><input type="checkbox" checked={diagnostics} onChange={e=>setDiagnostics(e.target.checked)}/>顯示詳細診斷</label>
{diagnostics&&<div className="diagnostics" aria-label="追蹤診斷"><dl>
   <dt>攝影機</dt><dd>{diag.camera}</dd><dt>模型／WASM</dt><dd>{diag.model}</dd><dt>辨識模式</dt><dd>{diag.mode}</dd><dt>管線</dt><dd>{diag.pipeline}</dd><dt>已處理影格</dt><dd>{diag.frames}</dd><dt>渲染 FPS</dt><dd>{perf.frame?.mean?(1000/perf.frame.mean).toFixed(1):fps}</dd><dt>追蹤 Hz</dt><dd>{perf.interval?.mean?(1000/perf.interval.mean).toFixed(1):hz}</dd><dt>攝影機解碼</dt><dd>{perf.cameraInterval?.mean?`${(1000/perf.cameraInterval.mean).toFixed(1)} Hz`:'瀏覽器未提供樣本'}</dd>
   <dt>解碼幀間隔</dt><dd>{format('cameraInterval')}</dd><dt>追蹤間隔</dt><dd>{format('interval')}</dd><dt>擷取／轉換</dt><dd>{format('capture')}</dd><dt>推論</dt><dd>{format('inference')}</dd><dt>結果送達延遲</dt><dd>{format('delivery')}</dd><dt>資料→畫面估計</dt><dd>{format('age')}</dd><dt>平滑落後估計</dt><dd>{format('smoothing')}</dd><dt>渲染幀間隔</dt><dd>{format('frame')}</dd><dt>CPU 幀工作</dt><dd>{format('cpu')}</dd><dt>單劍光軌 CPU</dt><dd>{format('trail')}</dd><dt>單劍音訊 CPU</dt><dd>{format('audio')}</dd><dt>光軌頂點 前／尾</dt><dd>{renderInfo.leftTrail} / {renderInfo.rightTrail}</dd><dt>實際像素比</dt><dd>{renderInfo.ratio.toFixed(2)}× · {renderInfo.calls} draw calls</dd><dt>武器控制</dt><dd>{weaponInfo}</dd><dt>模型設定</dt><dd>VIDEO／CPU · 雙手 · 偵測／存在／追蹤門檻均 0.55 · 鏡頭目標 640×480／30fps</dd><dt>身分配對</dt><dd>{scene.current?.control.identity.status}</dd><dt>音訊</dt><dd>{audioStatus} · Phase 1.1 原始合成</dd></dl>
   <p>{weaponInfo}</p><p>單一主控手／單一武器。雙拳靠攏保持片刻切換金色雙頭；先分開或鬆拳，再靠攏可切回。第二隻手不控制位置。原始 {leftLabel} 對應藍色，另一標籤對應紅色；實際左右手請依校正確認。</p><p>回退僅使用舊版姿態與動作濾波；主控手鎖定與武器型態規則共用。估計值不代表物理端到端延遲。</p><p>GPU 預熱：{scene.current?.warmup.status} · {scene.current?.warmup.ms.toFixed(1)} ms；音訊預備：{audio.current?.preparation.ms.toFixed(1)??'—'} ms／{audio.current?.preparation.noiseBuffers??0} 噪聲緩衝；排程 {audio.current?.scheduledCalls??0} 次，略過 {audio.current?.skippedUpdates??0} 次未變更新，省略 {audio.current?.skippedParameters??0} 次未變參數。</p><button className="secondary" onClick={copyStats}>複製統計摘要</button>{summary&&<textarea className="stat-summary" aria-label="統計摘要（不含影像或關鍵點）" readOnly value={summary} onFocus={e=>e.currentTarget.select()}/>}<p>{diag.detail||'啟動攝影機後會顯示實際追蹤資料；展示模式不代表實機追蹤。'}</p><small>時間依序為平均 / P95 / 峰值（最近最多 240 筆）。每 500 ms 更新。資料延遲從取樣時計算，非完整攝影機到螢幕延遲。CPU 提交時間不代表 GPU 執行時間；GPU 未直接量測。</small></div>}

   </section>
   <section className="setting-group"><h3>開發與測試</h3><button className="secondary" aria-pressed={demo} onClick={toggleDemo}>{demo?'停止展示':'光劍與音效展示'}</button><p>展示使用模擬動作，不代表攝影機追蹤結果。</p></section>
  </section></div>}
 </main>;
}
