import {SaberAudio as PreviousAudio} from '../benchmarks/phase11-audio.ts';
import {SaberAudio} from '../src/audio.ts';
import {MotionFilter} from '../src/motion.ts';
import {Vector3,Quaternion} from 'three';
import {writeFile,mkdir} from 'node:fs/promises';
let targets=0;
class Param{value=0;cancelScheduledValues(){}setTargetAtTime(){targets++}setValueAtTime(){}exponentialRampToValueAtTime(){}}
class Node{frequency=new Param();gain=new Param();Q=new Param();pan=new Param();connect(){}disconnect(){}start(){}stop(){}}
class Context{static last;sampleRate=24000;currentTime=0;state='running';destination={};constructor(){Context.last=this}createGain(){return new Node()}createOscillator(){return new Node()}createBiquadFilter(){return new Node()}createStereoPanner(){return new Node()}createBufferSource(){return new Node()}createBuffer(){return {getChannelData:()=>new Float32Array(48000)}}async decodeAudioData(){return {duration:3}}async resume(){}async close(){}}
globalThis.window={AudioContext:Context};globalThis.location={origin:'https://benchmark.example'};globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(44)});
async function audio(Version){const instance=new Version();await instance.unlock();targets=0;const start=performance.now();for(let i=0;i<600;i++){Context.last.currentTime=i/60;instance.update('Left',true,6+Math.sin(i/30)*5,1);instance.update('Right',true,6+Math.sin(i/30)*5,1);}const ms=performance.now()-start,result={seconds:10,frames:600,parameterTargets:targets,cpuMs:ms};instance.dispose();return result;}
const filter=new MotionFilter(),q=new Quaternion(),old=new Vector3(),target=new Vector3();let oldError=0,newError=0,input=0;
for(let frame=0;frame<600;frame++){
 const now=1000+frame*1000/60;
 if(now>=1000+input*1000/24){const time=1000+input*1000/24;target.set(Math.sin((time-1000)/1000*3),0,0);filter.push(target,q,time,now);input++;}
 old.lerp(target,1-Math.exp(-27/60));filter.sample(now);const actual=Math.sin((now-1000)/1000*3);if(frame>60){oldError+=Math.abs(old.x-actual);newError+=Math.abs(filter.position.x-actual);}
}
const report={environment:{node:process.version,platform:process.platform},method:'10 s synthetic 60 Hz updates; 24 Hz position samples. Audio nodes are counting substitutes, not real DSP or tablet measurements.',audio:{before:await audio(PreviousAudio),after:await audio(SaberAudio)},motion:{beforeMeanPositionError:oldError/539,afterMeanPositionError:newError/539,unit:'synthetic world units; not real input latency'}};
await mkdir('reports',{recursive:true});await writeFile('reports/phase12-cpu.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
