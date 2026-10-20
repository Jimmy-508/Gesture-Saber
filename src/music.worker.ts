import {analyzeMusic} from './music-analysis.ts';
self.onmessage=(event:MessageEvent<{pcm:Float32Array;rate:number}>)=>{try{const result=analyzeMusic(event.data.pcm,event.data.rate,value=>self.postMessage({progress:value}));self.postMessage({result});}catch(error){self.postMessage({error:String(error)});}};
