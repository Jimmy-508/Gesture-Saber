import {SaberScene} from '../benchmarks/phase16-scene';
import type {Side,Point} from './gesture';
import {Quaternion,Euler} from 'three';
import {HandAssignment} from './hand-assignment';
// @ts-expect-error Shared anatomical JavaScript fixture, also used by Node regression tests.
import {anatomicalHand,detections} from '../tests/fixtures/anatomical-hands.mjs';
const output=document.querySelector('#result')!,host=document.querySelector<HTMLDivElement>('#view')!;
document.querySelector<HTMLButtonElement>('#run')!.onclick=()=>{
 let now=1000;const audioEdges:{side:Side;active:boolean}[]=[],last={Left:false,Right:false};
 const scene=new SaberScene(host,(side,active)=>{if(last[side]!==active){audioEdges.push({side,active});last[side]=active;}},false,()=>now),checks:string[]=[];
 const check=(pass:boolean,label:string)=>{if(!pass)throw Error(label);checks.push('PASS '+label);};
 const assignment=new HandAssignment();
 const feed=(side:Side,angle=0,fist=false)=>{const h=anatomicalHand(side,new Quaternion().setFromEuler(new Euler(angle,0,0)));if(fist)for(const i of [6,7,8,10,11,12,14,15,16,18,19,20]){h.points[i]={...h.points[0]};h.world[i]={...h.world[0]};}const found=assignment.assign(detections([h],now));for(const {side,index} of found)scene.update({side,points:[h][index].points,world:h.world,time:now,imageAspect:h.aspect,open:false});};
 try{
  const delayed=anatomicalHand('Left');scene.update({...delayed,time:now-500,open:true});scene.renderFrame(now);check(scene.sabers.Left.state.active,'舊取樣的新到達觀測不被當成已離鏡');
  now+=20;feed('Left',0,true);scene.renderFrame(now);check(scene.sabers.Left.state.active&&!scene.sabers.Right.state.active,'握拳單手即啟動，無需張掌');
  for(let i=0;i<30;i++){now+=20;feed('Left',i/29*Math.PI/2,i%2===0);const h=anatomicalHand('Right',new Quaternion().setFromEuler(new Euler(i/29*Math.PI/2,0,0)));scene.update({...h,open:false,time:now,imageAspect:h.aspect});scene.renderFrame(now);}
  check(scene.sabers.Left.state.active&&scene.sabers.Right.state.active,'張掌握拳切換、旋腕與轉平掌不影響雙劍啟動');
  for(const missing of [5,9,17]){now+=20;const h=anatomicalHand('Left',new Quaternion().setFromEuler(new Euler(Math.PI/2,0,0)));h.points[missing]={x:NaN,y:NaN,z:NaN};h.world[missing]={x:NaN,y:NaN,z:NaN};const matched=assignment.assign(detections([h],now));check(matched.length===1,'部分掌部 '+missing+' 仍可歷史配對');scene.update({...h,open:true,time:now,imageAspect:h.aspect});scene.renderFrame(now);check(scene.sabers.Left.state.active&&Number.isFinite(scene.sabers.Left.group.position.x),'部分掌部 '+missing+' 姿態備援及顯示有限');now+=20;feed('Left',Math.PI/2);scene.renderFrame(now);}
  now+=20;const heldDirection=scene.sabers.Left.rotation.clone(),oldTarget=scene.sabers.Left.target.clone();const incomplete=anatomicalHand('Left');for(const i of [0,5,9,13,17])incomplete.points[i]={x:NaN,y:NaN,z:NaN};incomplete.points=incomplete.points.map((p:Point)=>({...p,x:p.x+.04}));incomplete.world=incomplete.world.map(()=>({x:NaN,y:NaN,z:NaN}));scene.update({...incomplete,open:true,time:now});scene.renderFrame(now);check(scene.sabers.Left.state.active&&!scene.sabers.Left.palm.reliable&&Number.isFinite(scene.sabers.Left.group.position.x),'姿態完全不可用但有觀測：保持啟動及有限位置');
  check(scene.sabers.Left.rotation.angleTo(heldDirection)<1e-8&&scene.sabers.Left.target.distanceTo(oldTarget)>.05&&scene.sabers.Left.state.canMove,'方向不可靠時仍獨立更新位置');
  now+=20;const frozen=scene.sabers.Left.group.position.clone();scene.retain('Left',now-500);scene.renderFrame(now);check(scene.sabers.Left.state.status==='TRACKED'&&!scene.sabers.Left.state.canMove&&scene.sabers.Left.group.position.distanceTo(frozen)<1e-8,'存在與姿態獨立：歧義時保留存在、凍結動作');
  scene.lost('Left',now,'注入遮擋');const held=scene.sabers.Left.group.position.clone();
  now+=60;feed('Right');scene.renderFrame(now);check(scene.sabers.Left.state.active&&held.distanceTo(scene.sabers.Left.group.position)<1,'短 LOST 保留啟動與短時間有限插值');
  now+=30;feed('Left');scene.renderFrame(now);check(audioEdges.filter(e=>e.side==='Left').length===1,'短遮擋不重複播放啟閉音效');
  scene.lost('Left',now,'注入持續遮擋');for(let i=0;i<25;i++){now+=20;feed('Right');scene.renderFrame(now);}
  check(!scene.sabers.Left.group.visible&&scene.sabers.Left.state.extension===0&&scene.sabers.Right.state.active,'持續 LOST 收劍隱藏，另一手獨立運作');
  check(scene.sabers.Left.ribbon.vertices===0,'遺失後光帶自然衰減');
  now+=20;feed('Left',0,true);scene.renderFrame(now);check(scene.sabers.Left.state.active&&scene.sabers.Left.state.extension>0,'握拳重新入鏡即重新伸出');
  check(audioEdges.filter(e=>e.side==='Left').map(e=>e.active).join(',')==='true,false,true','左手音訊依追蹤生命週期僅觸發三次轉換');
  const result={checks,left:scene.sabers.Left.state.diagnostics(now),right:scene.sabers.Right.state.diagnostics(now),audioEdges,model:'合成關鍵點與真正 WebGL 場景；非攝影機實機驗收'};
  scene.dispose();check(scene.renderer.info.memory.geometries===0,'釋放場景幾何');output.textContent=JSON.stringify({...result,checks},null,2);
 }catch(e){scene.dispose();output.textContent=checks.join('\n')+'\nFAIL '+e;}
};
