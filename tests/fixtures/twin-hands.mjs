import {anatomicalHand} from './anatomical-hands.mjs';
import {Quaternion,Vector3} from 'three';
/** Same asymmetric bilateral palm and bone lengths; curl each finger in 3D. */
export function commandHand(side,{fist=false,q=new Quaternion(),x=side==='Left'?.57:.43,y=.67,scale=1,noise=0}={}){
 const base=anatomicalHand(side),v=base.world.map(p=>new Vector3(-p.x,-p.y,p.z));
 if(fist)for(const [m,p,d,t] of [[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]]){
  const a=v[m],l1=a.distanceTo(v[p]),l2=v[p].distanceTo(v[d]),l3=v[d].distanceTo(v[t]);
  v[p]=a.clone().add(new Vector3(0,.75*l1,.6614*l1));v[d]=v[p].clone().add(new Vector3(0,-.65*l2,.7599*l2));v[t]=v[d].clone().add(new Vector3(0,-.96*l3,-.28*l3));
 }
 for(let i=0;i<v.length;i++)v[i].multiplyScalar(scale).applyQuaternion(q).add(new Vector3(Math.sin(i*4.3)*noise,Math.cos(i*2.7)*noise,Math.sin(i)*noise));
 const origin=v.reduce((s,p)=>s.add(p),new Vector3()).multiplyScalar(1/v.length),world=v.map(p=>({x:-(p.x-origin.x),y:-(p.y-origin.y),z:p.z-origin.z}));
 return {side,world,points:v.map(p=>({x:x-p.x*2,y:y-p.y*2*4/3,z:p.z*2})),aspect:4/3};
}
export function input(hands,time,labels=hands.map(h=>h.side==='Left'?'Right':'Left')){return {landmarks:hands.map(h=>h.points),world:hands.map(h=>h.world),handedness:labels.map(categoryName=>[{categoryName,score:.95}]),aspect:4/3,time};}
