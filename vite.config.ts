import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
 plugins:[react()],base:'/Gesture-Saber/',worker:{format:'es'},
 build:{rolldownOptions:{
  input:{main:'index.html',engineCheck:'tests/engine-check.html'},
  output:{codeSplitting:{groups:[{debugName:'runtime and framework bundles',name(id){
   const path=id.replaceAll('\\','/');
   if(path.includes('node_modules/three'))return 'three';
   if(path.includes('node_modules/@mediapipe'))return 'mediapipe';
   if(path.includes('node_modules/'))return 'react';
   if(path.includes('runtime')||path.includes('preload-helper'))return 'runtime';
   if(path.endsWith('/src/pipeline.ts'))return 'pipeline';
   return null;
  }}]}}
 }}
});
