import fs from 'node:fs';
import {replayRotation,rotationCases} from '../benchmarks/rotation-replay.mjs';
const rows=[];for(const name of rotationCases)for(const version of ['1.5.1','1.5.2'])rows.push(replayRotation(version,name));
const result={scope:'Deterministic anatomical dual-hand PalmPose + MotionFilter replay; 24Hz capture, 24ms delivery, 120Hz render. Irregular case varies both. No camera, GPU or tablet claim. Angles radians, positions scene units. bestFitLagMs fits truth history, not physical latency.',rows};
fs.writeFileSync('reports/phase152-rotation.json',JSON.stringify(result,null,2));
const traces=[];for(const name of ['step60','fastStop','jitter'])for(const version of ['1.5.1','1.5.2']){const replay=replayRotation(version,name,{trace:true});for(const side of ['left','right'])traces.push({version,name,side,samples:replay[side].trace});}
// One sample per line keeps the input/observation/output evidence reviewable.
fs.writeFileSync('reports/phase152-traces.json','[\n'+traces.map(({samples,...meta})=>JSON.stringify(meta).slice(0,-1)+',"samples":[\n'+samples.map(r=>JSON.stringify(r)).join(',\n')+'\n]}').join(',\n')+'\n]\n');
for(const r of rows)console.log(r.name,r.version,'deg mean/p95/peak',...[r.left.rotationErrorRad.mean,r.left.rotationErrorRad.p95,r.left.rotationErrorRad.peak].map(n=>(n*180/Math.PI).toFixed(2)),'lag',r.left.bestFitLagMs,'step90%',r.left.step90PercentMs,'tip',r.left.tipError.mean.toFixed(3),'over',(r.left.overshootRad*180/Math.PI).toFixed(2));
const values=(s,factor=1,digits=3)=>[s.mean,s.p95,s.peak].map(n=>(n*factor).toFixed(digits)).join(' / '),pair=name=>rows.filter(r=>r.name===name),md=['# 1.5.1 → 1.5.2 同輸入逐項統計','所有三數依序為平均 / P95 / 峰值。合成回放與桌面微基準，非平板端到端量測。','', '| 軌跡 | 1.5.1 旋轉誤差 ° | 1.5.2 旋轉誤差 ° |','|---|---:|---:|'];
for(const name of rotationCases){const [a,b]=pair(name);md.push(`| ${name} | ${values(a.left.rotationErrorRad,180/Math.PI,2)} | ${values(b.left.rotationErrorRad,180/Math.PI,2)} |`);}
md.push('','| 軌跡 | 1.5.1 劍尖偏差 | 1.5.2 劍尖偏差 | 1.5.1 握柄偏差 | 1.5.2 握柄偏差 |','|---|---:|---:|---:|---:|');
for(const name of rotationCases){const [a,b]=pair(name);md.push(`| ${name} | ${values(a.left.tipError)} | ${values(b.left.tipError)} | ${values(a.left.positionError)} | ${values(b.left.positionError)} |`);}
md.push('','| 軌跡 | 1.5.1 核心 CPU ms | 1.5.2 核心 CPU ms | 1.5.1／1.5.2 突發 >45° 次 | 1.5.1／1.5.2 錯誤翻轉次 |','|---|---:|---:|---:|---:|');
for(const name of rotationCases){const [a,b]=pair(name);md.push(`| ${name} | ${values(a.cpuFrameMs)} | ${values(b.cpuFrameMs)} | ${a.left.abruptRotations} / ${b.left.abruptRotations} | ${a.left.falseFlips} / ${b.left.falseFlips} |`);}
const [a,b]=pair('jitter');md.push('',`靜止方向 RMS 抖動：${(a.left.stationaryJitterRmsRad*180/Math.PI).toFixed(3)}° → ${(b.left.stationaryJitterRmsRad*180/Math.PI).toFixed(3)}°。`);
if(fs.existsSync('reports/phase152-webgl.json')){const web=JSON.parse(fs.readFileSync('reports/phase152-webgl.json','utf8'));md.push('','WebGL CPU 為固定步進的 JS／提交工作，不是實際 RAF 幀間隔或 GPU 時間；順序及快取／JIT 會影響單次數值。','', '| 軌跡 | 1.5.1 WebGL CPU ms | 1.5.2 WebGL CPU ms |','|---|---:|---:|');for(const name of [...new Set(web.frames.map(r=>r.name))]){const [a,b]=web.frames.filter(r=>r.name===name);md.push(`| ${name} | ${values(a.cpuFrameMs)} | ${values(b.cpuFrameMs)} |`);}}
fs.writeFileSync('reports/phase152-metrics.md',md.join('\n')+'\n');
