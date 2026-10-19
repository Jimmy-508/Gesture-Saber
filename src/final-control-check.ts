// QA only: the production scene, real WebGL, deterministic capture/arrival clocks.
import {SaberScene} from './scene';
import {Quaternion,Euler} from 'three';
// @ts-expect-error Shared anatomical QA fixtures.
import {commandHand,input} from '../tests/fixtures/twin-hands.mjs';
// @ts-expect-error Shared physical grip fixture.
import {gripHand} from '../tests/fixtures/grip-hands.mjs';
export function finalControlCheck(check:(ok:boolean,name:string)=>void){
 const host=document.createElement('div');host.style.cssText='position:fixed;width:320px;height:240px;left:-1000px';document.body.append(host);
 let now=1000;const scene=new SaberScene(host,()=>{},false,()=>now);
 try{for(const mode of ['single','twin'])for(const side of ['Left','Right'] as const){
  scene.hide();now+=1000;const send=(hands:unknown[],time=now)=>scene.receiveControls(input(hands,time-24));
  send([gripHand(side)]);scene.renderFrame(now);
  if(mode==='twin'){for(let i=0;i<8;i++){now+=42;send([gripHand(side),gripHand(side==='Left'?'Right':'Left')]);scene.renderFrame(now);}}
  const h=(x:number,a=0)=>gripHand(side,{x,open:mode==='twin',q:new Quaternion().setFromEuler(new Euler(0,0,a))});
  for(let i=0;i<14;i++){now+=42;send([h(side==='Left'?.57:.43)]);scene.renderFrame(now);}
  check(scene.control.mode.twin===(mode==='twin'),mode+' '+side+' 正式場景型態正確');
  now+=42;send([h(side==='Left'?.65:.35,.7)]);const accepted=now;scene.renderFrame(now+8);now+=12;send([]);scene.renderFrame(now);
  const oldError=scene.weapon.group.position.distanceTo(scene.control.hand.pose.position);now+=40;scene.renderFrame(now);
  check(!scene.control.hand.frozen&&scene.weapon.group.position.distanceTo(scene.control.hand.pose.position)<oldError,mode+' '+side+' 漏幀後正式WebGL完成既有銜接');
  check(scene.control.lastSeen===accepted&&scene.control.hand.lastSeen===accepted&&scene.weapon.state.lastSeen===accepted&&!scene.weapon.state.canMove,mode+' '+side+' 漏幀不延命、不產生未知光軌');
  now+=20;send([h(side==='Left'?.52:.48,-.4)]);const valid=now;scene.renderFrame(now+16);
  check(scene.weapon.group.position.equals(scene.control.hand.position)&&scene.weapon.group.quaternion.angleTo(scene.control.hand.rotation)<1e-7&&scene.weapon.group.visible,mode+' '+side+' 恢復姿態直接進入同一正式父節點');
  now=valid+420;scene.renderFrame(now);check(!scene.weapon.group.visible&&scene.control.primary===null,mode+' '+side+' 原時限收劍隱藏並清除主控');
 }
 const gl=scene.renderer.getContext();check(gl.getError()===gl.NO_ERROR,'漏幀與恢復檢查 WebGL 無錯誤');
 }finally{scene.dispose();check(scene.renderer.info.memory.geometries===0,'漏幀 QA 場景正確釋放');host.remove();}
}
