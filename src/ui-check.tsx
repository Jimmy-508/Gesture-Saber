import {createRoot} from 'react-dom/client';
import {App,type SessionHandle} from './app';
import type {TrackingSession} from './tracking';
import {initialDiagnostics} from './tracking';
import {Metric} from './metrics';
const root=document.querySelector('#ui-root')!,out=document.querySelector('#ui-result')!,button=document.querySelector<HTMLButtonElement>('#run-ui')!;
let alive=0,stops=0,failNext=false;
const sessions:{succeed:()=>void;rate:number;forced:boolean}[]=[];
function sessionFactory(...[,report,result,failure]:ConstructorParameters<typeof TrackingSession>):SessionHandle{
 let running=false;const item={rate:24,forced:false,succeed:()=>result({landmarks:[],world:[],handedness:[],time:performance.now(),ms:0})};sessions.push(item);
 return {stats:{capture:new Metric(),inference:new Metric(),delivery:new Metric(),interval:new Metric(),cameraInterval:new Metric()},setRate:n=>{item.rate=n;},async start(forced=false){item.forced=forced;running=true;alive++;report({...initialDiagnostics,camera:'測試串流：已取得',model:'測試模型：等待',pipeline:'模擬載入'});if(failNext){failNext=false;running=false;alive--;failure('攝影機權限遭拒絕（測試注入）');}},stop(){if(running){running=false;alive--;stops++;}report({...initialDiagnostics,camera:'已釋放',pipeline:'已停止'});}};
}
createRoot(root).render(<App sessionFactory={sessionFactory}/>);
const flush=()=>new Promise(r=>setTimeout(r,30));
function find(label:string){const b=root.querySelector<HTMLButtonElement>('button[aria-label="'+label+'"]');if(!b)throw Error('找不到 '+label);return b;}
button.onclick=async()=>{button.disabled=true;const checks:string[]=[];const check=(ok:boolean,label:string)=>{if(!ok)throw Error(label);checks.push('PASS '+label);};try{
 check(root.textContent?.trim()==='Gesture Saber'&&root.querySelectorAll('button').length===2,'主畫面只有完整標題與兩個圖示');
 find('開始攝影機').click();await flush();check(find('取消攝影機載入').classList.contains('is-loading')&&alive===1,'攝影機圖示進入可取消載入狀態');
 const cancelled=sessions.at(-1)!;find('取消攝影機載入').click();await flush();check(alive===0&&stops===1&&!!find('開始攝影機'),'載入取消釋放串流');cancelled.succeed();await flush();check(!!find('開始攝影機'),'過期回呼不能恢復已取消狀態');
 find('開始攝影機').click();await flush();sessions.at(-1)!.succeed();await flush();check(find('停止攝影機').getAttribute('aria-pressed')==='true','完成初始化後顯示啟動圖示');find('停止攝影機').click();await flush();check(alive===0&&stops===2,'再次點擊停止並釋放串流');
 failNext=true;find('開始攝影機').click();await flush();check(!!root.querySelector('[role=alert]'),'失敗保留可見錯誤提示');find('關閉錯誤提示').click();await flush();check(!root.querySelector('[role=alert]'),'錯誤可關閉');
 find('開啟設定').click();await flush();const dialog=root.querySelector<HTMLElement>('[role=dialog]')!;check(!!dialog&&!!dialog.textContent?.includes('尚未提供音樂播放功能。'),'設定包含誠實的音樂預留區域');
 const select=root.querySelector<HTMLSelectElement>('#quality')!;select.value='low';select.dispatchEvent(new Event('change',{bubbles:true}));await flush();check(select.value==='low','畫質設定可操作');
 const audio=root.querySelector<HTMLInputElement>('input[type=checkbox]')!;audio.click();await flush();check(!audio.checked,'音效開關可操作');
 const range=root.querySelector<HTMLInputElement>('#volume')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(range,'0.42');range.dispatchEvent(new Event('input',{bubbles:true}));await flush();check(root.querySelector('output')?.textContent==='42%','音量滑桿同步狀態');
 const labels=[...root.querySelectorAll('label')];const diagnostic=labels.find(l=>l.textContent?.includes('顯示詳細診斷'))!.querySelector('input')!;diagnostic.click();await new Promise(r=>setTimeout(r,550));check(!!dialog.querySelector('[aria-label="追蹤診斷"]')&&!!dialog.textContent?.includes('已釋放'),'詳細診斷只在設定內顯示且正確回報攝影機釋放');
 check(dialog.querySelectorAll('.hand-comparison tbody tr').length===29&&dialog.textContent?.includes('有效更新 Hz')===true,'逐手二十九項統計與雙劍對照只存在設定內');
 [...dialog.querySelectorAll('button')].find(b=>b.textContent==='複製統計摘要')!.click();await flush();const exported=JSON.parse(dialog.querySelector<HTMLTextAreaElement>('.stat-summary')!.value);check(exported.version==='1.5.2'&&!!exported.hands.Left&&!!exported.hands.Right&&!JSON.stringify(exported).includes('landmarks'),'統計摘要可手動複製且包含雙手、不含關鍵點');
 const compat=labels.find(l=>l.textContent?.includes('相容辨識模式'))!.querySelector('input')!;compat.click();await flush();dialog.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await flush();check(!root.querySelector('[role=dialog]')&&document.activeElement===find('開啟設定'),'Escape 關閉並恢復圖示焦點');
 check(root.textContent?.trim()==='Gesture Saber'&&root.querySelectorAll('button').length===2,'關閉設定後移除所有額外控制與診斷 DOM');
 find('開始攝影機').click();await flush();check(sessions.at(-1)!.forced&&sessions.at(-1)!.rate===18,'相容模式及省電追蹤頻率套用至下次啟動');find('取消攝影機載入').click();await flush();check(alive===0,'最終測試串流無殘留');out.textContent=JSON.stringify({checks,alive,stops,scope:'模擬 session 工廠；真實 React App 與 WebGL，非實機攝影機'},null,2);
 }catch(e){out.textContent=checks.join('\n')+'\nFAIL '+e;}finally{button.disabled=false;}};
