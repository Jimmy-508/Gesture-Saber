/** Original energy-shear transient, generated once per AudioContext. */
export const HIT_GAIN_SMOOTH=.0004;
export function writeImpact(samples:Float32Array,rate:number){
 let random=37,previous=0,low=0,peak=0,sum=0;
 for(let i=0;i<samples.length;i++){
  const t=i/rate;random=(random*1664525+1013904223)>>>0;const white=random/0xffffffff*2-1,edge=white-previous*.82;previous=white;low+=.16*(white-low);
  const phase=2*Math.PI*(Math.min(360,rate*.09)*t+Math.min(2200,rate*.3)*.021*(1-Math.exp(-t/.021)));
  const attack=Math.min(1,t/.0015),release=Math.min(1,(samples.length-i)/(rate*.018)),envelope=attack*Math.exp(-t*24)*release;
  const value=(edge*.46+low*.5+Math.sin(phase)*.3*Math.exp(-t*12)+Math.sin(phase*1.71)*.15*Math.exp(-t*35))*envelope;
  samples[i]=value;peak=Math.max(peak,Math.abs(value));sum+=value;
 }
 const mean=sum/samples.length;for(let i=0;i<samples.length;i++)samples[i]=(samples[i]-mean)*.72/Math.max(.001,peak+Math.abs(mean));
 samples[0]=samples[samples.length-1]=0;
}
