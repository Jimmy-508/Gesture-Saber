import {createRoot} from 'react-dom/client';import {App,type SessionHandle} from './app';import type {SaberScene} from './scene';import {initialDiagnostics,type TrackingSession,type TrackingResult} from './tracking';import {Metric} from './metrics';
// @ts-expect-error Full anatomical fixture shared with Node QA.
import {anatomicalHand,mirroredQuaternion} from '../tests/fixtures/anatomical-hands.mjs';
import {Quaternion,Euler} from 'three';
const host=document.querySelector('#app')!,out=document.querySelector('#result')!,run=document.querySelector<HTMLButtonElement>('#run')!;
let scene:SaberScene,deliver:(data:TrackingResult)=>void,alive=0,created=0;
function sessionFactory(...[,report,result]:ConstructorParameters<typeof TrackingSession>):SessionHandle{let running=false;created++;deliver=result;return {stats:{capture:new Metric(),inference:new Metric(),delivery:new Metric(),interval:new Metric(),cameraInterval:new Metric()},setRate(){},async start(){running=true;alive++;report({...initialDiagnostics,camera:'QA 模擬串流',model:'QA 合成觀測',pipeline:'正式 App receive'});},stop(){if(running){alive--;running=false;}}};}
const app=createRoot(host);app.render(<App sessionFactory={sessionFactory} onSceneReady={s=>{scene=s;}}/>);
const flush=()=>new Promise(r=>setTimeout(r,35));
const click=(label:string)=>(host.querySelector('button[aria-label="'+label+'"]') as HTMLButtonElement).click();
function choose(value:string){const s=host.querySelector<HTMLSelectElement>('#control-core')!;s.value=value;s.dispatchEvent(new Event('change',{bubbles:true}));}
let step=0;
function feed(hands:ReturnType<typeof anatomicalHand>[],labels=hands.map(h=>h.side==='Left'?'Right':'Left')){const time=performance.now()+step++*.01;deliver({landmarks:hands.map(h=>h.points),world:hands.map(h=>h.world),handedness:labels.map(categoryName=>[{categoryName,score:.95}]),time,ms:0,aspect:4/3});return time;}
run.onclick=async()=>{run.disabled=true;const checks:string[]=[];let raf:unknown;const check=(ok:boolean,name:string)=>{if(!ok)throw Error(name);checks.push('PASS '+name);};try{
 check(scene!.controlMode==='modern','正式 App 預設新核心');click('開始攝影機');await flush();
 // Throw if the modern production route enters any legacy estimator/filter.
 const restores:(()=>void)[]=[];for(const side of ['Left','Right'] as const){const s=scene.sabers[side];for(const [obj,key] of [[s.palm,'update'],[s.motion,'push'],[s.motion,'sample'],[s.motion,'freeze']] as const){const target=obj as unknown as Record<string,unknown>,original=target[key];target[key]=()=>{throw Error('舊核心被呼叫 '+key);};restores.push(()=>{target[key]=original;});}}
 const rawLeft=scene.control.identity.leftLabel,other=rawLeft==='Right'?'Left':'Right';
 for(let i=0;i<16;i++){feed([anatomicalHand('Left',undefined,.65+Math.sin(i)*.02)],[i%3===1?other:rawLeft]);scene.renderFrame(performance.now()+16);}
 check(scene.control.hands.Left.updates===16&&scene.control.hands.Right.updates===0,'單手錯誤標籤仍只驅動一把劍');
 for(let i=0;i<8;i++)feed([anatomicalHand('Left'),anatomicalHand('Right')],[rawLeft,other]);scene.renderFrame(performance.now()+40);
 check(scene.sabers.Left.group.visible&&scene.sabers.Right.group.visible,'正式攝影機回呼啟動雙劍');
 for(const side of ['Left','Right'] as const){const h=scene.control.hands[side],s=scene.sabers[side];check(s.group.position.distanceTo(h.position)<1e-10&&s.group.quaternion.angleTo(h.rotation)<1e-7,'直接輸出至 Three.js '+side);}
 scene.stats.frame.reset();scene.stats.cpu.reset();let sent=0;const began=performance.now(),timer=setInterval(()=>{const a=(performance.now()-began)/700,q=new Quaternion().setFromEuler(new Euler(-.5,0,Math.sin(a)*.5));feed([anatomicalHand('Left',q),anatomicalHand('Right',mirroredQuaternion(q))],[rawLeft,other]);sent++;},1000/24);await new Promise(r=>setTimeout(r,2400));clearInterval(timer);const interval=scene.stats.frame.snapshot();raf={wallMs:performance.now()-began,sent,observedHz:sent/(performance.now()-began)*1000,frameMs:interval,cpuMs:scene.stats.cpu.snapshot(),renderHz:interval.mean?1000/interval.mean:0,scope:'Actual desktop RAF and WebGL with synthetic ~24Hz observations; no MediaPipe inference or tablet camera.'};check(sent>35&&interval.count>0,'真實 RAF 與雙手觀測頻率分離');
 const h=anatomicalHand('Left',new Quaternion().setFromEuler(new Euler(-Math.PI/2,0,0)));feed([h],[rawLeft]);scene.renderFrame(performance.now()+16);check(scene.control.hands.Left.pose.source!=='HOLD','平掌指向在正式管線可用');
 const now=performance.now();feed([]);scene.renderFrame(now+100);check(scene.sabers.Left.group.visible&&scene.sabers.Left.state.active,'短遮擋保留啟動');scene.renderFrame(now+300);check(!scene.sabers.Left.state.active&&scene.sabers.Left.state.extension<1,'持續離鏡正常收縮');scene.renderFrame(now+460);check(!scene.sabers.Left.group.visible&&!scene.sabers.Right.group.visible,'持續遺失兩劍皆隱藏');
 for(const restore of restores)restore();click('開啟設定');await flush();check(host.querySelector<HTMLSelectElement>('#control-core')?.value==='modern','設定顯示預設新核心');
 choose('legacy');await flush();check(scene.controlMode==='legacy'&&!scene.sabers.Left.group.visible&&scene.control.hands.Left.updates===0,'切回 1.5.3 清除新姿態');
 feed([anatomicalHand('Left')],['Right']);scene.renderFrame(performance.now()+30);check(Number.isFinite(scene.sabers.Left.motion.lastSample)&&scene.sabers.Left.palm.status!=='尚未觀測','舊版確實使用原 PalmPose／MotionFilter');
 choose('modern');await flush();check(scene.controlMode==='modern'&&scene.sabers.Left.motion.lastSample===-Infinity&&!scene.sabers.Left.group.visible,'切回新版清除舊姿態');
 const button=[...host.querySelectorAll('button')].find(b=>b.textContent==='用實際左手校正')!;button.click();await flush();for(let i=0;i<6;i++)feed([anatomicalHand('Left')],['Left']);await flush();check(scene.control.identity.leftLabel==='Left'&&host.textContent!.includes('校正完成'),'使用者指定實際左手校正成功');
 feed([anatomicalHand('Left',undefined,.25)],['Left']);scene.renderFrame(performance.now()+16);check(scene.control.hands.Left.updates===1&&scene.control.hands.Right.updates===0,'校正後不以畫面位置決定劍色');
 choose('legacy');await flush();feed([anatomicalHand('Left',undefined,.25)],['Left']);scene.renderFrame(performance.now()+16);check(scene.sabers.Left.group.visible&&!scene.sabers.Right.group.visible,'校正映射在新舊核心間一致');
 check(created===1&&alive===1,'切換與校正共用同一攝影機 session');click('關閉設定');await flush();click('停止攝影機');await flush();check(alive===0&&!scene.sabers.Left.group.visible,'停止釋放 session 並重置雙劍');
 const gl=scene.renderer.getContext();check(scene.renderer.info.render.calls>0&&gl.getError()===gl.NO_ERROR,'正式場景 WebGL 無錯誤');
 app.unmount();check(scene.renderer.info.memory.geometries===0,'卸載釋放全部場景幾何');localStorage.removeItem('gesture-saber-left-label');out.textContent=JSON.stringify({checks,alive,created,raf,scope:'Real React App / receive / Three.js WebGL. Synthetic camera factory; no real tablet camera acceptance.'},null,2);
 }catch(e){out.textContent=JSON.stringify({checks,error:String(e)},null,2);}finally{run.disabled=false;}};
