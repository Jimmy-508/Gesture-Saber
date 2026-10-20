// QA only, reached from the existing integration page; never a game HUD.
import {SaberScene,HILT_BOTTOM} from './scene';
import {Quaternion,Euler,Vector3,Mesh,ShaderMaterial} from 'three';
// @ts-expect-error Shared bilateral physical hand fixtures.
import {gripHand} from '../tests/fixtures/grip-hands.mjs';
// @ts-expect-error Shared packet fixture.
import {input} from '../tests/fixtures/twin-hands.mjs';
export function unifiedGripCheck(check:(ok:boolean,name:string)=>void){
 const host=document.createElement('div');host.style.cssText='position:fixed;width:320px;height:240px;left:-1000px';document.body.append(host);
 let now=1000,on=false;const edges:boolean[]=[],scene=new SaberScene(host,(_side,active)=>{if(active!==on){on=active;edges.push(on);}},false,()=>now);
 const q=new Quaternion(),axis=new Vector3();
 try{for(const core of ['modern','legacy'] as const)for(const side of ['Left','Right'] as const){
  now+=1000;scene.setControlMode(core);
  const h=(open=false,x=side==='Left'?.57:.43,a=0)=>gripHand(side,{open,x,q:new Quaternion().setFromEuler(new Euler(.1,0,a)),noise:.00001});
  const send=(hands:unknown[])=>{now+=42;scene.receiveControls(input(hands,now-24));scene.renderFrame(now+16);};
  const hold=(hands:unknown[],ms=260)=>{for(let i=0;i<Math.ceil(ms/42);i++)send(hands);};
  const hands=()=>[h(),gripHand(side==='Left'?'Right':'Left')];
  const toggle=(wanted:boolean)=>{for(let i=0;i<30&&scene.control.mode.twin!==wanted;i++)send(hands());check(scene.control.mode.twin===wanted,core+' '+side+' 可信雙拳切換');return scene.control.mode.lastToggle;};
  hold([h(true)]);const w=scene.weapon;
  check(scene.control.primary===side&&w.group.visible&&!w.blade.visible&&!w.rear.visible,core+' '+side+' 初次張掌只有金屬握柄');
  hold([h()]);
  axis.set(0,1,0).applyQuaternion(w.group.quaternion);
  check(scene.control.singleOn&&w.blade.visible&&!w.rear.visible&&axis.angleTo(h().axis)<.02,core+' '+side+' 單拳原色單刃沿拳眼軸線');
  const beforeOpen=w.group.position.clone();hold([h(true,side==='Left'?.65:.35,.35)],320);
  check(w.group.visible&&w.blade.visible&&!w.rear.visible&&scene.control.primary===side&&w.hiltMaterials.every(m=>m.opacity===1)&&w.group.position.distanceTo(beforeOpen)>.1,core+' '+side+' 張掌仍維持單刃與Grip移動');
  const unknown=h(true,side==='Left'?.66:.34,.5);for(const i of [8,12,16])for(const p of [unknown.points,unknown.world])p[i]={x:NaN,y:NaN,z:NaN};
  hold([unknown]);check(scene.control.singleOn&&w.blade.visible&&w.group.visible,core+' '+side+' UNKNOWN 不會自行收刃');
  hold([h()],420);const changes=scene.control.mode.changes,beginEdges=edges.length,at=toggle(true);
  check(scene.morph.phase==='RETRACT'&&w.group.visible&&w.hiltMaterials.every(m=>m.opacity===1),core+' '+side+' 變形先收刃且握柄完整');
  q.copy(w.group.quaternion);now=at+130;scene.renderFrame(now);
  check(!w.blade.visible&&!w.rear.visible&&w.group.visible&&q.angleTo(w.group.quaternion)<.02,core+' '+side+' 空柄銜接沒有額外90度轉向');
  hold(hands(),420);
  check(w.blade.visible&&w.rear.visible&&scene.goldMix===1&&scene.control.mode.changes===changes+1&&edges.slice(beginEdges).join() === 'false,true',core+' '+side+' 雙頭一次收劍與開劍，不連續切換');
  check(w.blade.parent===w.group&&w.rear.parent===w.group&&w.rear.position.y===HILT_BOTTOM&&new Vector3(0,1,0).applyQuaternion(w.blade.quaternion).dot(new Vector3(0,1,0).applyQuaternion(w.rear.quaternion))<-.99999&&(w.rear.children[0] as Mesh<never,ShaderMaterial>).material.uniforms.color.value.getHex()===0xffd454,core+' '+side+' 金色雙刃同父節點同軸反向');
  hold([h(true,undefined,.6)],550);
  axis.set(0,1,0).applyQuaternion(w.group.quaternion);
  check(scene.control.singleOn&&w.blade.visible&&w.rear.visible&&axis.angleTo(h(true,undefined,.6).axis)<.02,core+' '+side+' 雙頭張掌仍鎖定並持續Grip控制');
  const exitEdges=edges.length;toggle(false);hold([h(true)],420);
  check(w.blade.visible&&!w.rear.visible&&w.group.visible&&scene.morph.on&&scene.goldMix===0&&edges.slice(exitEdges).join()==='false,true',core+' '+side+' 返回單頭即使張掌也重新伸刃，啟閉各一次');
  hold([h()]);check(w.blade.visible&&!w.rear.visible&&scene.control.primary===side,core+' '+side+' 同一主控握拳仍保持單刃');
  send([h(),gripHand(side==='Left'?'Right':'Left')]);const last=scene.control.lastSeen;for(let i=0;i<4;i++)send([gripHand(side==='Left'?'Right':'Left')]);check(scene.control.lastSeen===last&&scene.control.primary===side&&w.blade.visible,core+' '+side+' 短暫主控漏幀保留光刃，副手不延長存活');now=last+420;scene.renderFrame(now);check(!w.group.visible&&scene.control.primary===null&&!on,core+' '+side+' 真正遺失收劍隱藏且聲音停止');
 }
 const gl=scene.renderer.getContext();check(gl.getError()===gl.NO_ERROR,'統一Grip正式WebGL無錯誤');
 }finally{scene.dispose();check(scene.renderer.info.memory.geometries===0&&!on,'統一Grip場景釋放幾何及聲音狀態');host.remove();}
}
