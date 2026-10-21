import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
 plugins:[react()],base:'/Gesture-Saber/',worker:{format:'es'},
 build:{rolldownOptions:{
  input:{impactCheck:'tests/impact-check.html',coreCheck:'tests/core-check.html',blueCheck:'tests/blue-check.html',rotationCheck:'tests/rotation-check.html',duelCheck:'tests/duel-check.html',uiCheck:'tests/ui-check.html',gestureCheck:'tests/gesture-check.html',main:'index.html',engineCheck:'tests/engine-check.html',performance:'tests/performance.html'},
  output:{codeSplitting:{groups:[{debugName:'runtime and framework bundles',name(id){
   const path=id.replaceAll('\\','/');
   if(path.includes('node_modules/three'))return 'three';
   if(path.includes('node_modules/@mediapipe'))return 'mediapipe';
   if(path.includes('node_modules/'))return 'react';
   if(path.includes('runtime')||path.includes('preload-helper'))return 'runtime';
   if(path.endsWith('/src/pipeline.ts'))return 'pipeline';
   if(path.endsWith('/src/scene.ts')||path.endsWith('/src/motion.ts')||path.endsWith('/src/trail.ts')||path.endsWith('/src/metrics.ts')||path.endsWith('/src/dynamics.ts'))return 'saber';
   return null;
  }}]}}
 }}
});
