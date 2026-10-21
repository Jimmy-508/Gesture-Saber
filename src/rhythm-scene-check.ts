import {SaberScene} from './scene';import {RhythmGame} from './rhythm-game';import type {MusicTransport} from './music';import {Vector3} from 'three';
// @ts-expect-error Bilateral anatomical fixture used only by the QA entry.
import {gripHand} from '../tests/fixtures/grip-hands.mjs';
// @ts-expect-error Shared packet helper.
import {input} from '../tests/fixtures/twin-hands.mjs';
import {TRAVEL,FLIGHT_DEPTH,HIT_WINDOW} from './rhythm-chart';
export function rhythmSceneCheck(check:(ok:boolean,name:string)=>void){
 const host=document.createElement('div');host.style.cssText='position:fixed;left:-1000px;width:640px;height:400px';document.body.append(host);let now=1000,time=0;
 const scene=new SaberScene(host,()=>{},false,()=>now),clock={running:true,status:'playing',gameTime:()=>time} as unknown as MusicTransport,g=new RhythmGame(scene,clock);const point=new Vector3();
 const feed=(hands:unknown[])=>{now+=42;scene.receiveControls(input(hands,now-24));scene.renderFrame(now);};
 try{for(const side of ['Left','Right'] as const)for(const blade of ['single','front','rear']){
  scene.hide();g.stop();now+=1000;for(let i=0;i<7;i++)feed([gripHand(side)]);
  if(blade!=='single'){for(let i=0;i<14;i++)feed([gripHand(side),gripHand(side==='Left'?'Right':'Left')]);check(scene.control.mode.twin&&scene.weapon.rear.visible,side+' 真正雙拳切換後雙刃可見');}
  const mesh=blade==='rear'?scene.weapon.rear:scene.weapon.blade;scene.weapon.group.updateWorldMatrix(true,true);point.set(0,1.2,0).applyMatrix4(mesh.matrixWorld);
  g.setMusic({duration:7,events:[{time:3,strength:1,confidence:1}],bpm:null,confidence:.8,strategy:'QA geometry',sections:[]});const event=g.chart[0];event.x=point.x;event.y=point.y;g.start();time=1.5;feed([gripHand(side)]);check(g.score.score===0,side+' '+blade+' 遠端投影重疊不加分');
  const offset=Math.sign(point.z)*TRAVEL*(-.08+Math.sqrt(.08**2+4*.92*Math.abs(point.z)/FLIGHT_DEPTH))/(2*.92);now+=100;time=3+Math.max(-HIT_WINDOW+.01,Math.min(HIT_WINDOW-.01,offset));feed([gripHand(side)]);check(g.score.score>0&&g.hits===1,side+' '+blade+' 真實光刃矩陣碰撞擊碎得分');check(g.visuals.cutsCreated===1&&g.visuals.liveCuts===1&&g.visuals.liveSparks===8&&g.hitEnds[blade==='rear'?1:0]===1,side+' '+blade+' 相同雙半體裂光粒子及有效刃計數');feed([gripHand(side)]);check(g.hits===1&&g.visuals.cutsCreated===1,side+' '+blade+' 同一目標只得分及斬裂一次');
 }
 const gl=scene.renderer.getContext();check(gl.getError()===gl.NO_ERROR,'前後刃碰撞 WebGL 無錯誤');
 }finally{g.dispose();scene.dispose();check(scene.renderer.info.memory.geometries===0,'節奏目標、粒子與原場景幾何正確釋放');host.remove();}
}
