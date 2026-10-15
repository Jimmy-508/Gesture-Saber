import {Vector3,Matrix4,Quaternion} from 'three';
// Full asymmetric skeleton: thumb on radial side, differing finger lengths/MCP heights.
// A left/right pair reflects every bone and thumb, never just the classification label.
const palm=[
 [0,0,0],[.025,.022,.003],[.047,.037,.004],[.061,.052,.004],[.073,.064,.003],
 [.034,.073,.003],[.038,.117,.002],[.040,.145,.001],[.041,.168,0],
 [0,.085,0],[0,.135,0],[0,.166,0],[0,.191,0],
 [-.018,.078,.002],[-.022,.123,.002],[-.025,.150,.001],[-.027,.173,0],
 [-.033,.061,.003],[-.042,.097,.003],[-.047,.119,.002],[-.051,.137,.001]
];
export function mirroredQuaternion(q){const mirror=new Matrix4().makeScale(-1,1,1);return new Quaternion().setFromRotationMatrix(mirror.clone().multiply(new Matrix4().makeRotationFromQuaternion(q)).multiply(mirror));}
export function anatomicalHand(side,rotation=new Quaternion(),cx=side==='Left'?.7:.3,cy=.65,aspect=4/3){
 const vertices=palm.map(([x,y,z])=>new Vector3(side==='Left'?x:-x,y,z).applyQuaternion(rotation));
 const origin=vertices.reduce((sum,v)=>sum.add(v),new Vector3()).multiplyScalar(1/vertices.length);
 const world=vertices.map(v=>({x:-(v.x-origin.x),y:-(v.y-origin.y),z:v.z-origin.z}));
 const points=vertices.map(v=>({x:cx-v.x*2,y:cy-v.y*2*aspect,z:v.z*2}));
 return {side,world,points,rotation,aspect};
}
export function detections(hands,time,labels=hands.map(h=>h.side==='Left'?'Right':'Left')){return {landmarks:hands.map(h=>h.points),handedness:labels.map(categoryName=>[{categoryName,score:.95}]),time};}
