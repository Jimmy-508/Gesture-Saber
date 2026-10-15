/// <reference lib="webworker" />
import {createModel} from './model';
import type {HandLandmarker} from '@mediapipe/tasks-vision';
let detector:HandLandmarker;
self.onmessage=async ({data})=>{
 try {
  if(data.type==='init'){
   detector=await createModel(data.base);
   self.postMessage({type:'ready'});
  }else if(data.type==='frame'){
   try{const start=performance.now();const r=detector.detectForVideo(data.frame,data.time);self.postMessage({type:'result',landmarks:r.landmarks,world:r.worldLandmarks,handedness:r.handedness,time:data.time,ms:performance.now()-start});}finally{data.frame.close();}
  }else if(data.type==='close'){detector?.close();self.close();}
 }catch(error){self.postMessage({type:'error',stage:data.type==='init'?'model':'inference',message:String(error)});}
};
