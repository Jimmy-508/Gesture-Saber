import {writeFileSync} from 'node:fs';
import {WeaponControl} from '../src/weapon-control.ts';
import {WeaponControl as Baseline} from './phase18-weapon-control.ts';
import {finalReplay} from './final-replay.mjs';
const results=[];
for(const mode of ['single','twin'])for(const name of ['continuous','wrist','oneMiss','threeMiss','reverse','ambiguity','departure']){
 const before=finalReplay(Baseline,mode,name,'Left',true),after=finalReplay(WeaponControl,mode,name,'Left',true);
 const common=Math.min(before.outputs.length,after.outputs.length);let maxPositionDifference=0;
 const modeLost={before:mode==='twin'&&before.outputs.some(p=>!p.twin),after:mode==='twin'&&after.outputs.some(p=>!p.twin)};
 for(let i=0;i<common;i++)for(let j=0;j<3;j++)maxPositionDifference=Math.max(maxPositionDifference,Math.abs(before.outputs[i].position[j]-after.outputs[i].position[j]));
 delete before.outputs;delete after.outputs;
 results.push({mode,name,rotationComparisonValid:mode==='twin',modeLost,maxPositionDifference,before,after});
 console.log(mode,name,JSON.stringify({rejected:[before.rejected,after.rejected],stationaryMs:[before.stationaryWhileInputMovesMs,after.stationaryWhileInputMovesMs],recoveryPosition:[before.recoveryPositionStep.max,after.recoveryPositionStep.max],recoveryAngle:mode==='twin'?[before.recoveryAngleStepDeg.max,after.recoveryAngleStepDeg.max]:'Different direction semantics: not a latency comparison',positionSame:maxPositionDifference===0}));
}
writeFileSync('reports/final-grip-comparison.json',JSON.stringify({baseline:'b5c8c90043394e472319454e8f6532176539147f',scope:'Same anatomical fist/open packets and capture/arrival/render clocks. Current single and twin both use Grip; historical single used longitudinal pointing, so single rotation errors are against the new Grip target and MUST NOT be claimed as latency improvements. Position remains comparable. 24 Hz observations, 24 ms delivery, 60 Hz logical rendering; scene units, no physical tablet claim. CPU sample excludes inference/WebGL.',results},null,2)+'\n');
