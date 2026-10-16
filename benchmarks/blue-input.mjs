import {Quaternion,Euler} from 'three';
import {anatomicalHand,mirroredQuaternion} from '../tests/fixtures/anatomical-hands.mjs';
export const blueCases=['flat','edge','towardCamera','slow','fast','swing','stop','turn90','partial','conflict','depthAmbiguous','occlusion','cross','screenSwap','lowLabels','zeroHands','poorRight'];
function angle(name,t){
 if(name==='flat')return [-Math.PI/2,Math.PI,0];
 if(name==='edge')return [-.4,Math.PI/2,Math.sin(t/700)*.4];
 if(name==='towardCamera')return [-Math.min(1,t/800)*Math.PI/2,0,0];
 if(name==='slow')return [-.7+Math.sin(t/800)*.4,Math.sin(t/1000)*.4,Math.sin(t/900)*.5];
 if(name==='fast')return [-.6+Math.sin(t/150)*.6,Math.sin(t/180)*.4,Math.sin(t/160)*.6];
 if(name==='stop')return [-.4,0,Math.max(0,Math.min(t,1000)-500)*.004];
 if(name==='turn90')return [0,0,t<700?0:Math.PI/2];
 if(name==='depthAmbiguous')return [-Math.PI/2,0,0];
 return [-1,Math.sin(t/500)*.3,Math.sin(t/260)*.65];
}
/** Test observations and explicit ground truth. No image, actual operator or ML inference. */
export function blueInput(name,t,index=0){
 const e=angle(name,t),noise=.0015*Math.sin(index*1.91),q=new Quaternion().setFromEuler(new Euler(...e)),observed=new Quaternion().setFromEuler(new Euler(e[0]+noise,e[1],e[2]-noise));
 const centers=name==='cross'?[.75-Math.min(1,t/2200)*.5,.25+Math.min(1,t/2200)*.5]:name==='screenSwap'?[.28,.72]:[.72,.28];
 const shift=name==='stop'?Math.max(0,Math.min(t,1000)-500)*.00012:Math.sin(t/600)*.025;
 const truth=[anatomicalHand('Left',q,centers[0]+shift),anatomicalHand('Right',mirroredQuaternion(q),centers[1]-shift)];
 let hands=[anatomicalHand('Left',observed,centers[0]+shift),anatomicalHand('Right',mirroredQuaternion(observed),centers[1]-shift)];
 const disturbed=name==='poorRight'?1:0,h=hands[disturbed],weak=t>=600&&t<2200;
 if((name==='partial'||name==='poorRight')&&weak){h.world[5].z=NaN;if(index%3===0)h.points[5].z=NaN;}
 if(name==='conflict'&&weak)h.world=h.world.map(p=>({...p,z:2*h.world[0].z-p.z}));
 if(name==='depthAmbiguous'&&weak)hands[0]=anatomicalHand('Left',new Quaternion().setFromEuler(new Euler(Math.PI/2,0,0)),centers[0]+shift);
 if(name==='occlusion'&&index>=18&&index<=20)hands=hands.filter(h=>h.side!=='Left');
 if(name==='zeroHands'&&t>=700&&t<1800)hands=[];
 if(index%2)hands.reverse();
 const handedness=hands.map(h=>[{categoryName:name==='lowLabels'&&index>2&&index%8===0?'Right':h.side==='Left'?'Right':'Left',score:name==='lowLabels'?.51:.95}]);
 return {hands,truth,landmarks:hands.map(h=>h.points),world:hands.map(h=>h.world),handedness,time:1000+t,ms:0,aspect:4/3};
}
