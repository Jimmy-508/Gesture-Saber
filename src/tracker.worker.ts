/// <reference lib="webworker" />
import {FilesetResolver,HandLandmarker} from '@mediapipe/tasks-vision';
let detector:HandLandmarker;
self.onmessage=async ({data})=>{
 try {
  if(data.type==='init'){
   const vision=await FilesetResolver.forVisionTasks(data.base+'wasm',true);
   detector=await HandLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:data.base+'hand_landmarker.task',delegate:'CPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.55});
   self.postMessage({type:'ready'});
  }else if(data.type==='frame'){
   try{const start=performance.now();const r=detector.detectForVideo(data.frame,data.time);self.postMessage({type:'result',landmarks:r.landmarks,world:r.worldLandmarks,handedness:r.handedness,time:data.time,ms:performance.now()-start});}finally{data.frame.close();}
  }
 }catch(error){self.postMessage({type:'error',message:String(error)});}
};
