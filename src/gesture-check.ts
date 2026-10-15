import {SaberScene} from './scene';
import {classifyGesture,type Side} from './gesture';
import {Quaternion,Euler} from 'three';
// Reuse the asymmetric, anatomical regression fixtures in this developer-only entry.
// @ts-expect-error JavaScript fixture is intentionally shared with Node regression tests.
import {anatomicalHand} from '../tests/fixtures/anatomical-hands.mjs';
const output=document.querySelector('#result')!,host=document.querySelector<HTMLDivElement>('#view')!;
document.querySelector<HTMLButtonElement>('#run')!.onclick=()=>{
 let now=1000;const scene=new SaberScene(host,()=>{},false,()=>now),checks:string[]=[];
 const check=(pass:boolean,label:string)=>{if(!pass)throw Error(label);checks.push('PASS '+label);};
 const feed=(side:Side,angle=0,unknown=false)=>{const h=anatomicalHand(side,new Quaternion().setFromEuler(new Euler(angle,0,0)));scene.update({side,points:h.points,world:h.world,time:now,imageAspect:h.aspect,open:false,gesture:unknown?{kind:'UNKNOWN',count:0,confidence:0,reason:'注入矛盾關鍵點'}:classifyGesture(h.points,h.world,h.aspect)});};
 try{
  for(let i=0;i<30;i++){now+=20;feed('Left',i/29*Math.PI/2);feed('Right',i/29*Math.PI/2);scene.renderFrame(now);}
  check(scene.sabers.Left.state.active&&scene.sabers.Right.state.active,'雙手垂直轉平掌保持啟動');
  now+=40;feed('Left',Math.PI/2,true);feed('Right',Math.PI/2);scene.renderFrame(now);check(scene.sabers.Left.state.active,'UNKNOWN 不觸發收劍');
  scene.lost('Left',now,'注入遮擋');const held=scene.sabers.Left.group.position.clone();
  now+=60;feed('Right');scene.renderFrame(now);check(scene.sabers.Left.state.active&&held.distanceTo(scene.sabers.Left.group.position)<1e-8,'短暫 LOST 保持啟動與姿態');
  now+=30;feed('Left');feed('Right');scene.renderFrame(now);check(scene.sabers.Left.state.active,'短暫 LOST 恢復不重新啟閉');
  scene.lost('Left',now,'注入持續遮擋');for(let i=0;i<25;i++){now+=20;feed('Right');scene.renderFrame(now);}
  check(!scene.sabers.Left.group.visible&&scene.sabers.Left.state.extension===0&&scene.sabers.Right.state.active,'持續 LOST 隱藏左劍，右劍獨立運作');
  check(scene.sabers.Left.ribbon.vertices===0,'遺失後光帶已衰減');
  const result={checks,left:scene.sabers.Left.state.diagnostics(now),right:scene.sabers.Right.state.diagnostics(now),drawCalls:scene.renderer.info.render.calls,model:'未啟動模型；本頁僅驗證狀態與 WebGL 整合'};
  scene.dispose();check(scene.renderer.info.memory.geometries===0,'釋放場景幾何');output.textContent=JSON.stringify({...result,checks},null,2);
 }catch(e){scene.dispose();output.textContent=checks.join('\n')+'\nFAIL '+e;}
};
