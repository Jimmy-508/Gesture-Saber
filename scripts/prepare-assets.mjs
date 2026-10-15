import {mkdir,copyFile,readdir,writeFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
await mkdir('public/wasm',{recursive:true});
for(const file of await readdir('node_modules/@mediapipe/tasks-vision/wasm')){
 if(/\.(wasm|js)$/.test(file))await copyFile('node_modules/@mediapipe/tasks-vision/wasm/'+file,'public/wasm/'+file);
}
const path='public/hand_landmarker.task';
try{await access(path);}catch{
 const response=await fetch('https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task');
 if(!response.ok)throw Error('Model download failed: '+response.status);
 const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length<1000000)throw Error('Invalid model');
 await writeFile(path,bytes);console.log('Downloaded model:',bytes.length,'bytes; SHA256',createHash('sha256').update(bytes).digest('hex'));
}
console.log('MediaPipe model and WASM assets ready (served locally).');
