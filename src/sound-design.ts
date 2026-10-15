export type SoundName='hum'|'soft'|'fast'|'ignite'|'retract';
export const SOUND_DURATIONS:Record<SoundName,number>={hum:4,soft:3,fast:3,ignite:.25,retract:.20};
/** Original deterministic offline DSP, used by the build script only. No audio source material. */
export function synthesize(name:SoundName,rate=24000){
 const loop=name==='hum'||name==='soft'||name==='fast',n=Math.round(SOUND_DURATIONS[name]*rate),fade=Math.round(.12*rate),raw=new Float32Array(n+(loop?fade:0));
 let seed=({hum:123,soft:456,fast:789,ignite:314,retract:271})[name],low=0,body=0,phase=0;
 const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};
 for(let i=0;i<raw.length;i++){
  const t=i/rate,u=Math.min(1,t/SOUND_DURATIONS[name]),noise=rand();let value=0;
  if(name==='hum'){
   low+=.022*(noise-low);body+=.095*(noise-body);
   // Broadband low resonance, quiet sub-tone; no sawtooth harmonic stack or beat oscillator.
   value=low*.85+(body-low)*.18+Math.sin(2*Math.PI*49*t)*.035;
  }else if(name==='soft'||name==='fast'){
   const cutoff=name==='soft'?.14:.36;low+=cutoff*(noise-low);body+=.022*(noise-body);
   value=(low-body)*(name==='soft'?.55:.7)+body*.12;
  }else{
   const ignition=name==='ignite',hz=ignition?65+720*Math.pow(1-u,3):65+620*Math.pow(1-u,1.3);
   phase+=2*Math.PI*hz/rate;low+=(ignition?.23:.16)*(noise-low);
   const envelope=Math.sin(Math.PI*Math.pow(u,.45))*Math.pow(1-u,1.3);
   value=(low*.8+Math.sin(phase)*.10+Math.sin(phase*1.43)*.025)*envelope;
   if(ignition&&t<.023)value+=noise*.18*Math.exp(-t*180)*Math.min(1,t/.0015);
  }
  raw[i]=Math.tanh(value*1.6)*.75;
 }
 const output=raw.slice(0,n);
 if(loop){
  for(let i=0;i<fade;i++){const t=i/fade;output[i]=raw[n+i]*Math.cos(t*Math.PI/2)+raw[i]*Math.sin(t*Math.PI/2);}
  const start=output[0],end=output[n-1],join=(start+end)/2,ramp=Math.round(rate*.005);
  for(let i=0;i<ramp;i++){const w=.5*(1+Math.cos(Math.PI*i/ramp));output[i]+=(join-start)*w;output[n-1-i]+=(join-end)*w;}
 }
 return output;
}
