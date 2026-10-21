import {useEffect,useRef,useState} from 'react';
import {SaberScene,type Quality} from './scene';
import {TrackingSession,type TrackingResult} from './tracking';
import {SaberAudio} from './audio';
import {MusicTransport} from './music';
import {validateMusicFile} from './music-file';
import {RhythmGame} from './rhythm-game';
import {MusicPanel} from './music-panel';
import type {RawHand} from './control-identity';
import {CameraIcon,SettingsIcon,CloseIcon,PlayIcon,PauseIcon,RestartIcon} from './app-icons';
import './style.css';
type Status='idle'|'loading'|'running'|'paused'|'error';
export type SessionHandle=Pick<TrackingSession,'start'|'stop'|'setRate'|'stats'>;
type SessionFactory=(...args:ConstructorParameters<typeof TrackingSession>)=>SessionHandle;
function savedMapping():RawHand{try{return localStorage.getItem('gesture-saber-left-label')==='Left'?'Left':'Right';}catch{return 'Right';}}
export function App({sessionFactory=(...args)=>new TrackingSession(...args),onSceneReady,onGameReady}:{sessionFactory?:SessionFactory;onSceneReady?:(scene:SaberScene)=>void;onGameReady?:(game:RhythmGame,music:MusicTransport)=>void}){
 const host=useRef<HTMLDivElement>(null),scene=useRef<SaberScene|null>(null),session=useRef<SessionHandle|null>(null),audio=useRef<SaberAudio|null>(null),music=useRef<MusicTransport|null>(null),game=useRef<RhythmGame|null>(null),generation=useRef(0);
 const dialog=useRef<HTMLElement>(null),settingsButton=useRef<HTMLButtonElement>(null),started=useRef(false),soundRef=useRef(true),playRequest=useRef(0),panelOpen=useRef(false);
 const [status,setStatus]=useState<Status>('idle'),[error,setError]=useState(''),[settings,setSettings]=useState(false),[quality,setQuality]=useState<Quality>('medium');
 const [sound,setSound]=useState(true),[volume,setVolume]=useState(.3),[hasGame,setHasGame]=useState(false);
 const [view,setView]=useState({status:'empty',loaded:false,progress:null as number|null,time:0,score:0,combo:0,best:0,perfect:0,good:0,miss:0,safe:0,judgement:'',revision:0});
 function snapshot(){const m=music.current,g=game.current;if(!m||!g)return;const time=m.time(),s=g.score;setView({status:m.status,loaded:m.loaded&&g.chart.length>0,progress:m.loadProgress,time,score:s.score,combo:s.combo,best:s.bestCombo,perfect:s.perfect,good:s.good,miss:s.miss,safe:s.safe,judgement:s.judgement,revision:s.revision});}
 function ready(){return started.current&&!!scene.current?.control.singleOn&&!!scene.current?.weapon.group.visible&&!!scene.current?.weapon.state.canMove;}
 function pause(){playRequest.current++;music.current?.pause();snapshot();}
 function stop(next:Status='idle'){generation.current++;session.current?.stop();session.current=null;scene.current?.hide();audio.current?.pause(next==='paused');pause();started.current=false;setStatus(next);}
 function unlockAudio(){if(!audio.current)audio.current=new SaberAudio();audio.current.configure(soundRef.current,volume);void audio.current.unlock();}
 useEffect(()=>{
  try{const current=scene.current=new SaberScene(host.current!,(side,active,speed,extension)=>audio.current?.update(side,active,speed,extension),true,()=>performance.now());current.setControlMode('modern');current.control.setLeftLabel(savedMapping());const transport=music.current=new MusicTransport();game.current=new RhythmGame(current,transport,()=>transport.hit(soundRef.current));onSceneReady?.(current);onGameReady?.(game.current,transport);}catch{setStatus('error');setError('無法建立 WebGL 場景，請使用支援 WebGL 的瀏覽器。');}
  // UI snapshots only; scheduling/collision are on the Three.js loop.
  const timer=setInterval(()=>{if(music.current?.status!=='empty')snapshot();},150);
  const park=()=>{stop('paused');music.current?.suspend();snapshot();};const visibility=()=>{if(document.hidden)park();};document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',park);
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',park);stop();game.current?.dispose();game.current=null;music.current?.dispose();music.current=null;audio.current?.dispose();audio.current=null;scene.current?.dispose();scene.current=null;};
 },[]);
 useEffect(()=>{scene.current?.setQuality(quality);session.current?.setRate(quality==='low'?18:quality==='medium'?24:30);},[quality]);
 useEffect(()=>{soundRef.current=sound;audio.current?.configure(sound,volume);music.current?.setEffects(sound,volume);},[sound,volume]);
 function receive(data:TrackingResult){if(scene.current&&data.time<scene.current.controlEpoch)return;if(!started.current){started.current=true;setStatus('running');}scene.current?.receiveControls(data);}
 function start(){if(!scene.current)return;stop();unlockAudio();void music.current?.unlock().catch(()=>{});setError('');setStatus('loading');const id=generation.current;const next=sessionFactory(new URL(import.meta.env.BASE_URL,location.origin).href,()=>{},r=>{if(id===generation.current)receive(r);},message=>{if(id!==generation.current)return;setStatus('error');setError(message);scene.current?.hide();audio.current?.pause();pause();});session.current=next;next.setRate(quality==='low'?18:quality==='medium'?24:30);void next.start(false);}
 function changeSound(enabled:boolean){setSound(enabled);soundRef.current=enabled;if(!audio.current)audio.current=new SaberAudio();audio.current.configure(enabled,volume);if(enabled)void audio.current.unlock();else audio.current.pause();}
 function closeSettings(){panelOpen.current=false;setSettings(false);queueMicrotask(()=>settingsButton.current?.focus());}
 function openSettings(){pause();panelOpen.current=true;setSettings(true);}
 function trapFocus(e:React.KeyboardEvent<HTMLElement>){if(e.key==='Escape'){closeSettings();return;}if(e.key!=='Tab')return;const items=dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]');if(!items?.length)return;const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
 async function play(restart=false,automatic=false){const m=music.current,g=game.current;if(!m?.loaded||!g?.chart.length)return;
  if(!ready()){if(restart){pause();m.stop();g.reset();g.stop();setHasGame(false);snapshot();}else if(!automatic)setError('請先開啟攝影機，讓主控手光劍出現後再播放。');return;}
  const id=++playRequest.current,reset=restart||!g.active||m.status==='ended';
  try{const played=await m.play(reset,automatic);if(id!==playRequest.current||music.current!==m||!played)return;if(reset){g.start();setHasGame(true);}snapshot();}catch(e){if(id===playRequest.current)setError(e instanceof Error?e.message:String(e));snapshot();}
 }
 function togglePlay(){if(music.current?.running)pause();else void play();}
 function clearMusic(){playRequest.current++;music.current?.clear();game.current?.setMusic(null);game.current?.stop();setHasGame(false);setError('');snapshot();}
 async function loadMusic(file:File){const m=music.current,g=game.current;if(!m||!g)return;
  try{validateMusicFile(file);}catch(e){setError(e instanceof Error?e.message:String(e));return;}
  playRequest.current++;g.stop();g.setMusic(null);setHasGame(false);setError('');closeSettings();
  // Start resume synchronously inside the selection gesture; loading does not
  // wait for it. A blocked context simply leaves the ready song for a play tap.
  void m.unlock().catch(()=>{});
  const pending=m.load(file),version=m.loadVersion,id=playRequest.current;snapshot();await pending;
  if(music.current!==m||version!==m.loadVersion)return;
  if(m.error){setError(m.error);snapshot();return;}
  if(m.analysis){g.setMusic(m.analysis);g.prepare();if(!g.chart.length)setError('此歌曲無法遊玩，請重新選擇音樂。');}
  snapshot();if(id===playRequest.current&&!panelOpen.current&&!document.hidden&&ready())void play(true,true);
 }
 async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else setError('此瀏覽器未提供全螢幕控制。');}catch{setError('無法切換全螢幕，請再試一次。');}}
 const active=status==='running',loading=status==='loading',songLoading=view.status==='analyzing',playing=view.status==='playing'||view.status==='countdown';
 return <main>
  <div ref={host} className="scene" aria-label="手勢光劍節奏遊戲 3D 場景"/>
  <header className={'topbar'+(view.loaded?' has-music':'')}><h1>Gesture Saber</h1><nav aria-label="遊戲控制">
   {view.loaded&&!songLoading&&<><button className={'icon-button '+(playing?'is-active':'')} aria-label={playing?'暫停音樂':'播放音樂'} title={playing?'暫停音樂':'播放音樂'} aria-pressed={playing} onClick={togglePlay}>{playing?<PauseIcon/>:<PlayIcon/>}</button><button className="icon-button" aria-label="重新開始" title="重新開始" onClick={()=>void play(true)}><RestartIcon/></button></>}
   <button className={'icon-button camera '+(loading?'is-loading':active?'is-active':'')} aria-label={loading?'取消攝影機載入':active?'停止攝影機':'開始攝影機'} title={loading?'取消載入':active?'停止攝影機':'開始攝影機'} aria-pressed={active||loading} onClick={()=>active||loading?stop():start()}><CameraIcon/><span className="camera-indicator" aria-hidden="true"/></button>
   <button ref={settingsButton} className="icon-button" aria-label="開啟設定" title="設定" aria-haspopup="dialog" aria-expanded={settings} onClick={openSettings}><SettingsIcon/></button>
  </nav></header>
  {songLoading&&<div className="music-loading" role="status" aria-live="polite"><span>載入中…</span><progress aria-label="音樂載入進度" max="1" value={view.progress??undefined}/></div>}
  {hasGame&&!songLoading&&<div className="score-hud" aria-label="遊戲分數"><span className="score-label">SCORE</span><strong key={view.revision}>{view.score.toLocaleString()}</strong><span className="combo">{view.combo} COMBO</span><span className={'judgement '+view.judgement.toLowerCase()}>{view.judgement}</span></div>}
  {view.status==='countdown'&&hasGame&&!settings&&<div className="game-prompt" role="status"><strong>{Math.max(1,Math.ceil(-view.time))}</strong><span>準備揮劍</span></div>}
  {view.status==='ended'&&hasGame&&!settings&&<section className="results" aria-label="歌曲成績"><span className="score-label">SESSION COMPLETE</span><h2>{view.score.toLocaleString()}</h2><p>Perfect {view.perfect} · Good {view.good} · Miss {view.miss}</p><p>最高 Combo {view.best}{view.safe>0?' · 變形保護 '+view.safe:''}</p><button className="secondary" onClick={openSettings}>更換音樂</button></section>}
  {error&&<div className="error-toast" role="alert"><p>{error}</p><button className="icon-button" aria-label="關閉錯誤提示" onClick={()=>setError('')}><CloseIcon/></button></div>}
  {settings&&<div className="modal-backdrop" onClick={closeSettings}><section ref={dialog} className="settings" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={e=>e.stopPropagation()} onKeyDown={trapFocus}>
   <div className="panel-heading"><h2 id="settings-title">設定</h2><button autoFocus className="icon-button" aria-label="關閉設定" onClick={closeSettings}><CloseIcon/></button></div>
   <MusicPanel music={music.current} onSelect={file=>void loadMusic(file)} onClear={clearMusic}/>
   <section className="setting-group"><h3>光劍音效</h3><label className="check-row"><input type="checkbox" checked={sound} onChange={e=>changeSound(e.target.checked)}/>啟用音效</label><label htmlFor="volume">音量 <output>{Math.round(volume*100)}%</output></label><input id="volume" type="range" min="0" max="1" step=".01" value={volume} onChange={e=>setVolume(Number(e.target.value))}/></section>
   <section className="setting-group"><h3>畫面與效能</h3><label htmlFor="quality">畫面品質</label><select id="quality" value={quality} onChange={e=>setQuality(e.target.value as Quality)}><option value="low">省電</option><option value="medium">平衡</option><option value="high">精緻</option></select><p>自適應解析度已啟用。</p><button className="secondary" onClick={()=>void fullscreen()}>切換全螢幕</button></section>
  </section></div>}
 </main>;
}
