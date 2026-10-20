import {Quaternion,Euler} from 'three';
import {commandHand,input} from './twin-hands.mjs';
import {gripHand} from './grip-hands.mjs';

const missing={x:NaN,y:NaN,z:NaN};
export function fistPair({ratio=1.45,open=false,occluded=false,tips=false}={}){
 const hands=['Left','Right'].map(side=>commandHand(side,{fist:!open,noise:.00003}));
 const palms=hands.map(h=>{const p=[0,5,9,13,17].map(i=>h.points[i]),x=p.reduce((s,p)=>s+p.x,0)/5,y=p.reduce((s,p)=>s+p.y,0)/5;const scale=Math.max(...[5,9,13,17].map(i=>Math.hypot(h.points[i].x-h.points[0].x,(h.points[i].y-h.points[0].y)/(4/3))),Math.hypot(h.points[5].x-h.points[17].x,(h.points[5].y-h.points[17].y)/(4/3)));return{x,y,scale};});
 hands.forEach((h,i)=>{for(const p of h.points){p.x+=.5+(i===0?1:-1)*ratio*(palms[0].scale+palms[1].scale)/4-palms[i].x;p.y+=.5-palms[i].y;}if(occluded)for(const j of [14,15,16,18,19,20])for(const p of [h.points,h.world])p[j]={...missing};if(tips)for(const j of [8,12,16,20])for(const p of [h.points,h.world])p[j]={...missing};});
 return hands;
}
export const toggleCases=[
 {name:'clean',positive:true},
 {name:'low labels',positive:true,labels:'low'},
 {name:'flipped labels',positive:true,labels:'flipped'},
 {name:'two hidden fingers',positive:true,occluded:true},
 {name:'hidden tips with positive proximal curl',positive:true,tips:true},
 {name:'natural wider approach',positive:true,ratio:1.95},
 {name:'126ms hold',positive:true,times:[0,42,84,126]},
 {name:'8Hz observations',positive:true,times:[0,125]},
 {name:'pose ambiguity does not reject symmetric command',positive:true,ambiguous:true},
 {name:'single hand',positive:false,single:true},
 {name:'duplicate observation',positive:false,duplicate:true},
 {name:'nearly duplicate observation',positive:false,nearDuplicate:true},
 {name:'excessive overlap',positive:false,ratio:.2},
 {name:'open palms',positive:false,open:true},
 {name:'one open palm',positive:false,oneOpen:true},
 {name:'far fists',positive:false,ratio:3.5},
 {name:'no curl evidence',positive:false,noCurl:true},
 {name:'zero model observations',positive:false,zero:true},
 {name:'brief accidental pass',positive:false,times:[0,42,84]},
];
export function togglePackets(c){
 const initial=commandHand('Left',{fist:true,x:c.ambiguous?.5:.65,y:c.ambiguous?.58:.67});
 const packets=[input([initial],1000)];
 for(const dt of c.times??[0,42,84,126,168,210,252]){
  let hands=fistPair(c);
  if(c.oneOpen)hands[1]=fistPair({...c,open:true})[1];
  if(c.noCurl)for(const h of hands)for(const j of [6,7,8,10,11,12,14,15,16,18,19,20])for(const p of [h.points,h.world])p[j]={...missing};
  if(c.duplicate||c.nearDuplicate){hands[1]=structuredClone(hands[0]);if(c.nearDuplicate)for(const p of hands[1].points)p.x+=.001;}
  if(c.single)hands=hands.slice(0,1);if(c.zero)hands=[];
  const d=input(hands,1042+dt);if(c.labels==='low')d.handedness.forEach(h=>h[0].score=.25);if(c.labels==='flipped')d.handedness.reverse();packets.push(d);
 }
 return packets;
}
export const presenceCases=['continuous','reverse low labels','reverse flipped labels','partial palm','side turn','brief zero','secondary only','true zero'];
export function presencePackets(name,side='Left'){
 const mirror=x=>side==='Left'?x:1-x,other=side==='Left'?'Right':'Left',packets=[];
 for(let i=0;i<22;i++){
  let x=name.startsWith('reverse')?[.2,.45,.7,.3][Math.min(i,3)]:.67+Math.sin(i*.4)*.04;
  const h=gripHand(side,{x:mirror(x),open:i>6,q:new Quaternion().setFromEuler(new Euler(0,i*.02,Math.sin(i*.2)*.7)),noise:.00001});
  if(name==='partial palm'&&i>2)for(const j of [9,17])for(const p of [h.points,h.world])p[j]={...missing};
  let hands=[h];if(name==='brief zero'&&[4,5,9].includes(i)||name==='true zero'&&i>3)hands=[];
  if(name==='secondary only'){const secondary=gripHand(other,{x:mirror(.15)});hands=i===0?[h]:i<4?[h,secondary]:[secondary];}
  const time=name.startsWith('reverse')&&i>=3?1210+(i-3)*42:1000+i*42;
  const d=input(hands,time);if(i>=3&&name.includes('labels'))d.handedness=[[{categoryName:name.includes('flipped')?(side==='Left'?'Left':'Right'):(side==='Left'?'Right':'Left'),score:name.includes('low')?.2:.95}]];
  packets.push(d);
 }
 return packets;
}
