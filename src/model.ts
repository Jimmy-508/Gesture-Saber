import {FilesetResolver,HandLandmarker} from '@mediapipe/tasks-vision';
let queue:Promise<unknown>=Promise.resolve();
export function createModel(base:string,signal?:AbortSignal){
 const pending=queue.catch(()=>{}).then(async()=>{
  signal?.throwIfAborted();
  // Module workers need ESM glue; document script loading needs classic glue.
  const files=await FilesetResolver.forVisionTasks(base+'wasm',typeof document==='undefined');
  signal?.throwIfAborted();
  const model=await HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:base+'hand_landmarker.task',delegate:'CPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.55});
  if(signal?.aborted){model.close();signal.throwIfAborted();}return model;
 });
 queue=pending.then(()=>{},()=>{});return pending;
}
