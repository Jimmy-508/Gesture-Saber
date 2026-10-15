// Historical Phase 1.3 fixture for scripts/compare-phase13.mjs, never imported by gameplay/build.
export type SoundName='hum'|'soft'|'fast'|'ignite'|'retract';
export const SOUND_DURATIONS:Record<SoundName,number>={hum:5,soft:4,fast:4,ignite:.28,retract:.22};
/** Original build-only resonant noise. No imported recordings or live oscillators. */
export function synthesize(name:SoundName,rate=24000){
 const loop=['hum','soft','fast'].includes(name),n=Math.round(SOUND_DURATIONS[name]*rate),fade=Math.round(.18*rate),raw=new Float32Array(n+(loop?fade:0));
 let seed=({hum:1023,soft:2456,fast:3789,ignite:4314,retract:5271})[name],low=0,air=0,phase=0;
 const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};
 // Damped resonators color noise without detuned beating/rotor modulation.
 const filters=[{f:118,q:1.4},{f:235,q:1.1},{f:510,q:.8},{f:1450,q:.7}].map(({f,q})=>{
  const w=2*Math.PI*f/rate,a=Math.sin(w)/(2*q),a0=1+a;
  return {b0:a/a0,b2:-a/a0,a1:-2*Math.cos(w)/a0,a2:(1-a)/a0,x1:0,x2:0,y1:0,y2:0};
 });
 const bands=new Float64Array(4);
 for(let i=0;i<raw.length;i++){
  const t=i/rate,u=Math.min(1,t/SOUND_DURATIONS[name]),noise=rand();low+=.035*(noise-low);air+=.32*(noise-air);
  for(let k=0;k<4;k++){const f=filters[k],y=f.b0*noise+f.b2*f.x2-f.a1*f.y1-f.a2*f.y2;f.x2=f.x1;f.x1=noise;f.y2=f.y1;f.y1=y;bands[k]=y;}let value:number;
  if(name==='hum'){
   // Stable dark resonance, no periodic tremolo or speed-controlled fundamental.
   value=Math.sin(2*Math.PI*58*t)*.13+Math.sin(2*Math.PI*116*t+.4)*.036+Math.sin(2*Math.PI*174*t+1)*.015+bands[0]*.85+bands[1]*.35+low*.20;
  }else if(name==='soft'||name==='fast'){
   const hard=name==='fast',texture=.88+.12*Math.sin(t*2.3+.4*Math.sin(t*1.7));
   value=(bands[0]*(hard?.45:.9)+bands[1]*(hard?.8:1.1)+bands[2]*(hard?1.05:.35)+bands[3]*(hard?.65:.06)+(air-low)*(hard?.38:.08))*texture;
  }else{
   const ignition=name==='ignite',attack=1-Math.exp(-t/(ignition?.002:.003)),tail=Math.pow(1-u,ignition?1.1:1.6);
   const hz=ignition?95+1050*Math.exp(-t*32):75+420*Math.pow(1-u,2);phase+=2*Math.PI*hz/rate;
   const body=Math.sin(phase)*.20+Math.sin(phase*2+.7)*.035,sweep=bands[1]*1.1+bands[2]*1.4+bands[3]*.9+air*.35;
   value=(body+sweep)*attack*tail;if(ignition)value+=noise*.42*Math.exp(-t*125)*attack;
  }
  raw[i]=Math.tanh(value*2)*.82;
 }
 // Diffuse tail baked once, no runtime convolution/reverb nodes.
 for(const [delay,gain] of [[.019,.12],[.037,.07],[.061,.035]]){const d=Math.round(delay*rate);for(let i=raw.length-1;i>=d;i--)raw[i]+=raw[i-d]*gain;}
 const output=raw.slice(0,n);
 if(loop){
  for(let i=0;i<fade;i++){const t=i/fade;output[i]=raw[n+i]*(1-t)+raw[i]*t;}
  const join=(output[0]+output[n-1])/2,start=output[0],end=output[n-1],ramp=Math.round(rate*.008);
  for(let i=0;i<ramp;i++){const w=.5*(1+Math.cos(Math.PI*i/ramp));output[i]+=(join-start)*w;output[n-1-i]+=(join-end)*w;}
 }else{const ramp=Math.round(rate*.006);for(let i=0;i<ramp;i++)output[n-1-i]*=i/ramp;}
 return output;
}
