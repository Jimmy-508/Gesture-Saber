import {useEffect,useRef,useState} from 'react';
import {SaberScene,type Quality} from './scene';
import {type Side} from './gesture';
import {TrackingSession,initialDiagnostics,type Diagnostics,type TrackingResult} from './tracking';
import {SaberAudio} from './audio';
import {runtimeStatus} from './runtime';
import {HandAssignment} from './hand-assignment';
import type {HandTelemetry} from './hand-telemetry';
import type {Summary} from './metrics';
import type {ControlMode} from './control-core';
import {legacyInput,type RawHand} from './control-identity';
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
 const assignment=useRef(new HandAssignment()),latestDiag=useRef<Diagnostics>({...initialDiagnostics}),dialog=useRef<HTMLElement>(null),settingsButton=useRef<HTMLButtonElement>(null);

 const [poseInfo,setPoseInfo]=useState({Left:'尚未觀測',Right:'尚未觀測',identity:'等待手部'});
 const samples=useRef({time:0,count:0});
 const lastContext=useRef({modelHands:0,identity:'等待手部',details:[] as string[],mode:'—'}),sessionClock=useRef({start:null as number|null,end:null as number|null}),lastTracking=useRef<Record<string,Summary>>({});
 const started=useRef(false),showMetrics=useRef(false);
 const [handPerf,setHandPerf]=useState<Partial<Record<Side,ReturnType<HandTelemetry['snapshot']>>>>({}),[summary,setSummary]=useState('');
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
  generation.current++;assignment.current.reset();session.current?.stop();session.current=null;latestDiag.current={...latestDiag.current,camera:'已釋放',model:runtimeStatus(),pipeline:'已停止（攝影機已釋放）',mode:'—'};scene.current?.hide();if(scene.current)scene.current.demo=false;
  audio.current?.dispose();audio.current=null;setAudioStatus('已停止');started.current=false;setHz(0);setStatus(next);
 }
 function unlockAudio(){
  if(!audio.current)audio.current=new SaberAudio();audio.current.configure(sound,volume);void audio.current.unlock().then(()=>setAudioStatus(audio.current?.status??'已停止'));
 }
 useEffect(()=>{
  try{scene.current=new SaberScene(host.current!,(side,active,speed,extension)=>audio.current?.update(side,active,speed,extension));scene.current.setControlMode('modern');scene.current.control.setLeftLabel(leftLabel);onSceneReady?.(scene.current);}catch{setStatus('error');setError('無法建立 WebGL 場景。請使用支援 WebGL 的瀏覽器。');}
  const interval=setInterval(()=>{
   if(!showMetrics.current)return;const now=performance.now();if(scene.current)setHandPerf({Left:scene.current.sabers.Left.telemetry.snapshot(now),Right:scene.current.sabers.Right.telemetry.snapshot(now)});setDiag({...latestDiag.current});
   setFps(scene.current?.fps??0);setAudioStatus(audio.current?.status??'等待操作啟用');
   if(showMetrics.current){const describe=(side:Side)=>{if(scene.current?.demo)return '展示模式：未使用手部姿態';if(scene.current?.controlMode==='modern'){const h=scene.current.control.hands[side],p=h.pose;return `方向 ${p.direction.x.toFixed(2)}, ${p.direction.y.toFixed(2)}, ${p.direction.z.toFixed(2)} · ${p.source} · ${p.reason} · 方向保留 ${p.holds} 筆 · ${scene.current.sabers[side].state.diagnostics(now)}`;}const p=scene.current?.sabers[side].palm;return p?`方向 ${p.direction.x.toFixed(2)}, ${p.direction.y.toFixed(2)}, ${p.direction.z.toFixed(2)} · Δ ${p.deltaDegrees.toFixed(1)}° · ${p.status} · 姿態可信 ${p.reliable?'是':'否'} · ${scene.current?.sabers[side].state.diagnostics(performance.now())}`:'尚未觀測';};const identity=scene.current?.controlMode==='modern'?scene.current.control.identity:assignment.current;setPoseInfo({Left:describe('Left'),Right:describe('Right'),identity:identity.details.join(' · ')+' · '+identity.status});const all:Record<string,Summary>={};for(const [key,value] of Object.entries(scene.current?.stats??{}))all[key]=value.snapshot();for(const [key,value] of Object.entries(session.current?.stats??{}))all[key]=value.snapshot();setPerf(all);setRenderInfo({ratio:scene.current?.pixelRatio??1,calls:scene.current?.renderer.info.render.calls??0,leftTrail:scene.current?.sabers.Left.ribbon.vertices??0,rightTrail:scene.current?.sabers.Right.ribbon.vertices??0});}
  },500);
  const pause=()=>{stop('paused');setDemo(false);};const visibility=()=>{if(document.hidden)pause();};
  document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',pause);
  return()=>{clearInterval(interval);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',pause);stop();scene.current?.dispose();};
 },[]);
 useEffect(()=>{scene.current?.setQuality(quality);session.current?.setRate(quality==='low'?18:quality==='medium'?24:30);},[quality]);
 useEffect(()=>{audio.current?.configure(sound,volume);},[sound,volume]);
 function receive(data:TrackingResult){
  if(scene.current&&data.time<scene.current.controlEpoch)return;
  if(calibration.current&&scene.current?.controlMode==='modern'){
   const label=data.handedness[0]?.[0],c=calibration.current;
   if(data.landmarks.length===1&&observeHand(data.landmarks[0])&&(label?.categoryName==='Left'||label?.categoryName==='Right')&&label.score>=.7){c.count=c.label===label.categoryName?c.count+1:1;c.label=label.categoryName;}else c.count=0;
   if(c.count>=6){const raw=c.label as RawHand;calibration.current=null;scene.current.hide();scene.current.control.setLeftLabel(raw);scene.current.controlEpoch=performance.now();assignment.current.reset();setLeftLabel(raw);try{localStorage.setItem('gesture-saber-left-label',raw);}catch{}setCalibrationMessage('校正完成：實際左手藍劍、實際右手紅劍。');return;}
  }
  if(!started.current){started.current=true;setStatus('running');}
  if(scene.current?.controlMode==='modern'){
   scene.current.receiveControls(data);const id=scene.current.control.identity;lastContext.current={modelHands:data.landmarks.length,identity:id.status,details:id.details,mode:latestDiag.current.mode};
  }else{
  let left=false,right=false;
  const leftRaw=scene.current?.control.identity.leftLabel??'Right',matches=assignment.current.assign(legacyInput(data,leftRaw)),arrived=performance.now();
  lastContext.current.modelHands=data.landmarks.length;lastContext.current.identity=assignment.current.status;lastContext.current.details=assignment.current.details;lastContext.current.mode=latestDiag.current.mode;
  for(const side of ['Left','Right'] as Side[]){const expected=side==='Left'?leftRaw:leftRaw==='Left'?'Right':'Left',match=matches.find(m=>m.side===side),raw=data.handedness.filter(h=>h[0]?.categoryName===expected).length;scene.current?.sabers[side].telemetry.result(raw,!!match,!!match?.freeze,arrived);if(match){const label=data.handedness[match.index]?.[0];scene.current?.sabers[side].telemetry.recordInput(label?.categoryName,label?.score,side,!!match.freeze,expected);}}
  for(const {side,index:i,freeze} of matches){
   if(freeze)scene.current?.retain(side,data.time);else scene.current?.update({side,points:data.landmarks[i],world:data.world[i],open:true,time:data.time,imageAspect:data.aspect});
   if(side==='Left')left=true;else right=true;
  }
  for(const side of ['Left','Right'] as Side[])if(!(side==='Left'?left:right))scene.current?.lost(side,data.time,data.landmarks.length?'模型回傳 '+data.landmarks.length+' 隻，該手未配對：'+assignment.current.status:'MediaPipe 未回傳手部');
  }
  samples.current.count++;const elapsed=performance.now()-samples.current.time;
  if(elapsed>1000){if(showMetrics.current)setHz(Math.round(samples.current.count*1000/elapsed));samples.current={time:performance.now(),count:0};}
 }
 function start(){
  if(!scene.current)return;stop();for(const s of Object.values(scene.current.sabers))s.telemetry.reset();setSummary('');unlockAudio();setDemo(false);setError('');setStatus('loading');latestDiag.current={...initialDiagnostics};setDiag({...initialDiagnostics});samples.current={time:performance.now(),count:0};const id=generation.current;
  sessionClock.current={start:performance.now(),end:null};lastContext.current={modelHands:0,identity:'等待手部',details:[],mode:'—'};lastTracking.current={};
  const next=sessionFactory(new URL(import.meta.env.BASE_URL,location.origin).href,d=>{if(id===generation.current)latestDiag.current=d;},r=>{if(id===generation.current)receive(r);},message=>{if(id!==generation.current)return;sessionClock.current.end=performance.now();setStatus('error');setError(message);latestDiag.current={...latestDiag.current,camera:'已釋放',detail:message};scene.current?.hide();audio.current?.dispose();audio.current=null;});
  session.current=next;next.setRate(quality==='low'?18:quality==='medium'?24:30);void next.start(forceMain);
 }
 function toggleDemo(){stop();const next=!demo;setDemo(next);setError('');if(next)unlockAudio();if(scene.current)scene.current.demo=next;}
 function changeCore(mode:ControlMode){calibration.current=null;setCalibrationMessage('');setCoreMode(mode);assignment.current.reset();scene.current?.setControlMode(mode);if(scene.current)scene.current.demo=false;lastContext.current={modelHands:0,identity:'核心切換：等待觀測',details:[],mode:latestDiag.current.mode};setDemo(false);setSummary('');setHandPerf({});setPerf({});}
 function calibrate(){if(calibration.current){calibration.current=null;setCalibrationMessage('已取消校正。');}else{calibration.current={label:'',count:0};setCalibrationMessage('請只伸入實際左手，保持片刻；右手留在鏡頭外。再次點擊可取消。');}}
 function changeSound(enabled:boolean){setSound(enabled);if(!audio.current)audio.current=new SaberAudio();audio.current.configure(enabled,volume);if(enabled)void audio.current.unlock().then(()=>setAudioStatus(audio.current?.status??'已停止'));else setAudioStatus('已靜音');}
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
 function copyStats(){const now=performance.now(),clock=sessionClock.current;const text=JSON.stringify({version:'1.6.0',controlMode:scene.current?.controlMode,control:scene.current?.controlMode==='modern'?scene.current.control.snapshot(now):undefined,generatedAt:new Date().toISOString(),sessionMs:clock.start===null?0:Math.max(0,(clock.end??now)-clock.start),demo:scene.current?.demo??false,mapping:scene.current?.controlMode==='modern'?'raw '+leftLabel+' → blue / Left; calibrated physical left → blue, right → red; uncalibrated mapping retains 1.5.3':'legacy with input calibration: raw '+leftLabel+' → blue / Left',latestResult:lastContext.current,pipeline:latestDiag.current,quality,render:perf.frame,cpu:perf.cpu,tracking:session.current?Object.fromEntries(Object.entries(session.current.stats).map(([k,m])=>[k,m.snapshot()])):lastTracking.current,hands:scene.current?{Left:scene.current.sabers.Left.telemetry.snapshot(now),Right:scene.current.sabers.Right.telemetry.snapshot(now)}:handPerf,audio:{preparation:audio.current?.preparation,scheduledCalls:audio.current?.scheduledCalls,skippedUpdates:audio.current?.skippedUpdates,skippedParameters:audio.current?.skippedParameters},warmup:scene.current?.warmup},null,2);setSummary(text);void navigator.clipboard?.writeText(text).catch(()=>{});}
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
   <section className="setting-group"><h3>手部控制</h3><label htmlFor="control-core">控制核心</label><select id="control-core" value={coreMode} onChange={e=>changeCore(e.target.value as ControlMode)}><option value="modern">新版控制核心（預設）</option><option value="legacy">舊版 Phase 1.5.3 控制核心（回退）</option></select><p>切換會清除追蹤姿態，攝影機保持運作。</p>{coreMode==='modern'&&<><button className="secondary" disabled={!active} onClick={calibrate}>用實際左手校正</button><p>{calibrationMessage||'左手藍、右手紅。若顏色相反，啟動攝影機後，只伸入實際左手進行校正。未校正前沿用 1.5.3 映射。'}</p></>}</section>
   <section className="setting-group"><h3>攝影機與診斷</h3><label className="check-row"><input type="checkbox" checked={forceMain} onChange={e=>setForceMain(e.target.checked)}/>下次啟動使用相容辨識模式</label><p>預設嘗試 Worker，失敗時自動切換主執行緒。切換分頁會釋放攝影機；回來後可重新開啟。</p><label className="check-row"><input type="checkbox" checked={diagnostics} onChange={e=>setDiagnostics(e.target.checked)}/>顯示詳細診斷</label>
{diagnostics&&<div className="diagnostics" aria-label="追蹤診斷"><dl>
   <dt>攝影機</dt><dd>{diag.camera}</dd><dt>模型／WASM</dt><dd>{diag.model}</dd><dt>辨識模式</dt><dd>{diag.mode}</dd><dt>管線</dt><dd>{diag.pipeline}</dd><dt>已處理影格</dt><dd>{diag.frames}</dd><dt>渲染 FPS</dt><dd>{perf.frame?.mean?(1000/perf.frame.mean).toFixed(1):fps}</dd><dt>追蹤 Hz</dt><dd>{perf.interval?.mean?(1000/perf.interval.mean).toFixed(1):hz}</dd><dt>攝影機解碼</dt><dd>{perf.cameraInterval?.mean?`${(1000/perf.cameraInterval.mean).toFixed(1)} Hz`:'瀏覽器未提供樣本'}</dd>
   <dt>解碼幀間隔</dt><dd>{format('cameraInterval')}</dd><dt>追蹤間隔</dt><dd>{format('interval')}</dd><dt>擷取／轉換</dt><dd>{format('capture')}</dd><dt>推論</dt><dd>{format('inference')}</dd><dt>結果送達延遲</dt><dd>{format('delivery')}</dd><dt>資料→畫面估計</dt><dd>{format('age')}</dd><dt>平滑落後估計</dt><dd>{format('smoothing')}</dd><dt>渲染幀間隔</dt><dd>{format('frame')}</dd><dt>CPU 幀工作</dt><dd>{format('cpu')}</dd><dt>單劍光軌 CPU</dt><dd>{format('trail')}</dd><dt>單劍音訊 CPU</dt><dd>{format('audio')}</dd><dt>光軌頂點 藍／紅</dt><dd>{renderInfo.leftTrail} / {renderInfo.rightTrail}</dd><dt>實際像素比</dt><dd>{renderInfo.ratio.toFixed(2)}× · {renderInfo.calls} draw calls</dd><dt>左手姿態</dt><dd>{poseInfo.Left}</dd><dt>右手姿態</dt><dd>{poseInfo.Right}</dd><dt>模型設定</dt><dd>VIDEO／CPU · 雙手 · 偵測／存在／追蹤門檻均 0.55 · 鏡頭目標 640×480／30fps</dd><dt>身分配對</dt><dd>{poseInfo.identity}</dd><dt>音訊</dt><dd>{audioStatus} · Phase 1.1 原始合成</dd></dl>
   <table className="hand-comparison"><caption>逐手統計 · 藍 Left／紅 Right</caption><thead><tr><th>指標</th><th>藍劍</th><th>紅劍</th></tr></thead><tbody>{(['modelLabelHz','updateHz','model','pairs','pairRate','rejects','missing','interruptions','freezes','recoveries','fallbacks','poseRecoveries','qualityRecoveries','guards','positionJumps','rotationJumps','rawGap','gap','delay','smoothing','positionError','positionLag','directionGap','rotationError','rotationLag','rateLimits','predictionFrames','predictionCappedFrames','predictionActive','poseUpdates','reliablePosePct','worldPoses','imagePoses','heldPoses','guardRestrictedPoses','inputToPose','inputToRender'] as const).filter(key=>coreMode==='legacy'||['modelLabelHz','updateHz','model','pairs','pairRate','rejects','missing','interruptions','freezes','recoveries','rawGap','gap','delay','positionError','rotationError'].includes(key)).map(key=><tr key={key}><th>{{modelLabelHz:'模型標籤 Hz',updateHz:'有效更新 Hz',model:'模型觀測數',pairs:'配對成功',pairRate:'配對涵蓋率 %',rejects:'有標籤未配對',missing:'缺席影格',interruptions:'配對中斷',freezes:'歧義凍結段',recoveries:'配對恢復',fallbacks:'姿態備援筆',poseRecoveries:'歧義姿態恢復',qualityRecoveries:'姿態備援恢復',guards:'方向保護筆',positionJumps:'位置突變筆',rotationJumps:'旋轉突變筆',rawGap:'模型標籤間隔 ms',gap:'有效間隔 ms',delay:'資料延遲 ms',smoothing:'平滑落後 ms',positionError:'握柄濾波距差',positionLag:'握柄落後估計 ms',directionGap:'方向觀測間隔 ms',rotationError:'旋轉濾波角差 °',rotationLag:'旋轉落後估計 ms',rateLimits:'姿態限速筆',predictionFrames:'旋轉外推影格',predictionCappedFrames:'外推達角度上限影格',predictionActive:'旋轉外推目前啟用',poseUpdates:'姿態觀測筆',reliablePosePct:'可靠姿態比例 %',worldPoses:'世界座標姿態筆',imagePoses:'影像座標備援筆',heldPoses:'無方向保留筆',guardRestrictedPoses:'實際指向／限速限制筆',inputToPose:'觀測指向→姿態差 °',inputToRender:'觀測指向→畫面差 °'}[key]}</th>{(['Left','Right'] as Side[]).map(side=>{const v=handPerf[side]?.[key];return <td key={side}>{v===undefined?'—':typeof v==='boolean'?(v?'是':'否'):typeof v==='number'?v.toFixed(key.endsWith('Hz')?1:0):[v.mean,v.p95,v.peak].map(n=>n.toFixed(key==='positionError'?3:1)).join(' / ')}</td>;})}</tr>)}</tbody></table><p>{coreMode==='modern'?'新版：原始 '+leftLabel+' → 藍；另一標籤 → 紅。單手身分持續鎖定，沒有動作外推。請以實際左手校正確認手別。':'舊核心（沿用手別校正）：原始 '+leftLabel+' → 藍；另一標籤 → 紅。'}{(['Left','Right'] as Side[]).map(side=><span key={side}><br/>{side==='Left'?'藍':'紅'}：{coreMode==='modern'?(side==='Left'?poseInfo.Left:poseInfo.Right):'來源 '+(handPerf[side]?.pose.source??'NONE')+' · 標籤 '+(handPerf[side]?.labels.last??'Unknown')+' · 保護 '+(handPerf[side]?.pose.guards.join(' + ')||'無')}</span>)}</p><p>{coreMode==='modern'?'新版不使用預測、舊版姿態限速或多層追趕。有效更新率與觀測間隔來自實際結果；旋轉／位置距差是當下目標到畫面差，不是真實端到端延遲。計數自本次啟動累計，時間為最近最多 240 筆平均／P95／峰值。模型標籤 Hz 不能當成實際左右手召回率。':"配對涵蓋率以所有模型結果影格為分母（含零手），歧義凍結計入配對、排除有效更新 Hz。中斷包含未配對與超過 180 ms 的送達缺口。計數自本次啟動累計；時間為最近最多 240 筆平均／P95／峰值。模型 Hz 依原始手別標籤歸屬，標籤錯誤會影響歸屬；不能視為真實左右手召回率。方向間隔依姿態觀測取樣時間；位置／旋轉距差與落後是觀測值到畫面的絕對誤差換算，可能包含外推超前，不能視為真實端到端延遲。外推維持 22 ms／0.12 rad 上限，表中受限次數包含角度及前次轉動幅度限制，以渲染影格計。觀測指向差來自模型座標，非真實手部方向；可用來分辨保護前與畫面之間的落差。可靠姿態比例不含身分歧義凍結，分母是姿態觀測筆。位置突變 &gt;1 場景單位、角度 &gt;60°，是觀測提示而非已證明的錯誤。"}</p><p>GPU 預熱：{scene.current?.warmup.status} · {scene.current?.warmup.ms.toFixed(1)} ms；音訊預備：{audio.current?.preparation.ms.toFixed(1)??'—'} ms／{audio.current?.preparation.noiseBuffers??0} 噪聲緩衝；排程 {audio.current?.scheduledCalls??0} 次，略過 {audio.current?.skippedUpdates??0} 次未變更新，省略 {audio.current?.skippedParameters??0} 次未變參數。</p><button className="secondary" onClick={copyStats}>複製統計摘要</button>{summary&&<textarea className="stat-summary" aria-label="統計摘要（不含影像或關鍵點）" readOnly value={summary} onFocus={e=>e.currentTarget.select()}/>}<p>{diag.detail||'啟動攝影機後會顯示實際追蹤資料；展示模式不代表實機追蹤。'}</p><small>時間依序為平均 / P95 / 峰值（最近最多 240 筆）。每 500 ms 更新。資料延遲從取樣時計算，非完整攝影機到螢幕延遲。CPU 提交時間不代表 GPU 執行時間；GPU 未直接量測。</small></div>}

   </section>
   <section className="setting-group"><h3>開發與測試</h3><button className="secondary" aria-pressed={demo} onClick={toggleDemo}>{demo?'停止展示':'光劍與音效展示'}</button><p>展示使用模擬動作，不代表攝影機追蹤結果。</p></section>
  </section></div>}
 </main>;
}
