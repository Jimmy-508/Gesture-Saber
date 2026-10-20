import {useRef,useReducer} from 'react';
import type {MusicTransport} from './music';
import type {RhythmGame} from './rhythm-game';
const timeLabel=(t:number)=>Math.floor(Math.max(0,t)/60)+':'+String(Math.floor(Math.max(0,t)%60)).padStart(2,'0');
export function MusicPanel({music:m,game:g,ready,hasGame,play,onClear,onError}:{music:MusicTransport|null;game:RhythmGame|null;ready:boolean;hasGame:boolean;play:(restart?:boolean)=>Promise<void>;onClear:()=>void;onError:(error:string)=>void}){
 const input=useRef<HTMLInputElement>(null),[,refresh]=useReducer(n=>n+1,0);const a=m?.analysis,playing=m?.running;
 async function load(file:File|undefined){if(!file||!m||!g)return;g.stop();g.setMusic(null);onClear();onError('');const pending=m.load(file),version=m.loadVersion;await pending;if(version!==m.loadVersion)return;if(m.error)onError(m.error);if(m.analysis){g.setMusic(m.analysis);g.prepare();if(!g.chart.length)onError('沒有足夠的可玩音樂事件，請選擇其他歌曲；仍可自由揮劍。');}}
 function clear(){m?.clear();g?.setMusic(null);g?.stop();onClear();onError('');if(input.current)input.current.value='';}
 return <section className="setting-group music-settings"><h3>匯入音樂</h3><label className="file-picker" htmlFor="music-file">{m?.name?'更換音樂檔案':'選擇本機音樂'}<input ref={input} id="music-file" type="file" accept="audio/*,.mp3,.wav,.m4a,.aac" onChange={e=>{const file=e.target.files?.[0];e.target.value='';void load(file);}}/></label><p>只在此瀏覽器分析及播放，不上傳。上限 64 MB／15 分鐘；格式依裝置解碼能力。</p>
  {m?.name&&<div className="song-info"><strong>{m.name}</strong><span>{timeLabel(m.time())} / {timeLabel(m.duration)}</span></div>}
  {m?.status==='analyzing'&&<div role="status"><label htmlFor="analysis-progress">解碼與分析 {Math.round(m.progress*100)}%</label><progress id="analysis-progress" value={m.progress} max="1"/><button className="secondary" onClick={clear}>取消匯入</button></div>}
  {a&&<p className="analysis-result">{a.strategy}<br/>{a.bpm?'約 '+a.bpm+' BPM · 週期可信度 '+Math.round(a.confidence*100)+'%':'BPM 不確定'} · {a.events.length} 個事件 → {g?.chart.length??0} 個目標<br/>密集／稀疏段落 {a.sections.filter(s=>s.density>2).length} / {a.sections.filter(s=>s.density<=2).length} · 已套用單刃友善密度</p>}
  {!!m?.name&&!g?.chart.length&&m?.status!=='analyzing'&&<button className="secondary" onClick={clear}>移除音樂</button>}
  {!!g?.chart.length&&<><div className="playback-controls"><button className="primary" disabled={!ready&&!playing} onClick={()=>playing?m?.pause():void play()}>{playing?'暫停':hasGame&&m?.status!=='ended'?'繼續遊戲':'開始遊戲'}</button><button className="secondary" disabled={!ready} onClick={()=>void play(true)}>重新開始</button>{hasGame&&<button className="secondary" onClick={()=>{m?.stop();g?.stop();onClear();}}>停止遊戲</button>}<button className="secondary" onClick={clear}>移除音樂</button></div>{!ready&&<p>先開啟攝影機，讓主控手光劍出現後即可開始。</p>}
   <label htmlFor="music-volume">音樂音量 <output>{Math.round((m?.volume??.65)*100)}%</output></label><input id="music-volume" type="range" min="0" max="1" step=".01" value={m?.volume??.65} onChange={e=>{m?.setVolume(Number(e.target.value));refresh();}}/><label htmlFor="sync-offset">音畫同步偏移 <output>{m?.syncMs??0} ms</output></label><input id="sync-offset" type="range" min="-300" max="300" step="10" disabled={playing} value={m?.syncMs??0} onChange={e=>{m?.setSync(Number(e.target.value));refresh();}}/><p>暫停後可校正。正值使目標提早到達，負值使目標延後，以補償裝置及耳機延遲。</p></>}
 </section>;
}
