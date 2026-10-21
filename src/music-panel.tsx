import {useReducer} from 'react';
import type {MusicTransport} from './music';
import {MUSIC_ACCEPT} from './music-file';
export function MusicPanel({music:m,onSelect,onClear}:{music:MusicTransport|null;onSelect:(file:File)=>void;onClear:()=>void}){
 const [,refresh]=useReducer(n=>n+1,0);
 return <section className="setting-group music-settings"><h3>匯入音樂</h3>
  <label className="file-picker" htmlFor="music-file">{m?.name?'更換音樂檔案':'選擇本機音樂'}<input id="music-file" type="file" accept={MUSIC_ACCEPT} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)onSelect(file);}}/></label>
  <p>MP3、WAV、M4A、AAC、FLAC、Ogg、AIFF；格式依裝置支援。上限 64 MB／15 分鐘，音樂不會上傳。</p>
  {m?.name&&<div className="song-info"><strong>{m.name}</strong><button className="secondary" onClick={onClear}>移除音樂</button></div>}
  <label htmlFor="music-volume">音樂音量 <output>{Math.round((m?.volume??.65)*100)}%</output></label><input id="music-volume" type="range" min="0" max="1" step=".01" value={m?.volume??.65} onChange={e=>{m?.setVolume(Number(e.target.value));refresh();}}/>
  <label htmlFor="sync-offset">音畫同步偏移 <output>{m?.syncMs??0} ms</output></label><input id="sync-offset" type="range" min="-300" max="300" step="10" value={m?.syncMs??0} onChange={e=>{m?.setSync(Number(e.target.value));refresh();}}/><p>正值讓目標提早到達，負值讓目標延後，可補償裝置及耳機延遲。</p>
 </section>;
}
