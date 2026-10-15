import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {synthesize,SOUND_DURATIONS} from '../src/sound-design.ts';
const rate=24000,manifest={version:'1.3',sampleRate:rate,origin:'Original build-time resonant-noise DSP; no external recordings',files:{}};
await mkdir('public/audio',{recursive:true});
for(const name of Object.keys(SOUND_DURATIONS)){
 const samples=synthesize(name,rate),bytes=Buffer.alloc(44+samples.length*2);
 bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(samples.length*2,40);
 for(let i=0;i<samples.length;i++)bytes.writeInt16LE(Math.round(Math.max(-1,Math.min(1,samples[i]))*32767),44+i*2);
 await writeFile('public/audio/'+name+'.wav',bytes);manifest.files[name]={bytes:bytes.length,seconds:SOUND_DURATIONS[name],sha256:createHash('sha256').update(bytes).digest('hex')};
}
await writeFile('public/audio/manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log('Five original sound buffers prepared offline (24 kHz PCM).');
