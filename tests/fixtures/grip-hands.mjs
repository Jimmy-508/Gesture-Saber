import {commandHand} from './twin-hands.mjs';import {Vector3,Quaternion,Euler} from 'three';
/** Fingers curl around an oblique shaft; MCP row remains anatomically asymmetric.
 * Thus a shortcut using MCP5→17 cannot pass the expected shaft-direction test. */
export function gripHand(side,{open=false,q=new Quaternion(),tilt=.4,x=side==='Left'?.57:.43,noise=0}={}){
 const base=commandHand(side),v=base.world.map(p=>new Vector3(-p.x,-p.y,p.z)),bend=new Quaternion().setFromEuler(new Euler(0,tilt,0)),sign=side==='Left'?1:-1;
 if(!open)for(const [m,p,d,t] of [[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]]){const lengths=[v[m].distanceTo(v[p]),v[p].distanceTo(v[d]),v[d].distanceTo(v[t])],directions=[[0,.75,.6614],[0,-.65,.7599],[0,-.96,-.28]];let prior=v[m];for(let i=0;i<3;i++){const delta=new Vector3(...directions[i]).normalize().multiplyScalar(lengths[i]).applyQuaternion(bend);delta.x*=sign;v[[p,d,t][i]]=prior.clone().add(delta);prior=v[[p,d,t][i]];}}
 for(let i=0;i<v.length;i++)v[i].applyQuaternion(q).add(new Vector3(Math.sin(i*4.3)*noise,Math.cos(i*2.7)*noise,Math.sin(i)*noise));const center=v.reduce((a,p)=>a.add(p),new Vector3()).multiplyScalar(1/v.length),world=v.map(p=>({x:-(p.x-center.x),y:-(p.y-center.y),z:p.z-center.z}));
 const axis=new Vector3(1,0,0).applyQuaternion(bend);axis.x*=sign;axis.applyQuaternion(q);
 return {side,world,points:v.map(p=>({x:x-p.x*2,y:.67-p.y*2*4/3,z:p.z*2})),axis,aspect:4/3};
}
