import type {MusicAnalysis,MusicEvent} from './rhythm-chart.ts';
export const ANALYSIS_RATE=16000;
/** Reused radix-2 FFT buffers; invoked in an analysis Worker before gameplay. */
export function analyzeMusic(pcm:Float32Array,rate=ANALYSIS_RATE,progress:(value:number)=>void=()=>{}):MusicAnalysis{
 if(!pcm.length||pcm.length/rate>900)throw Error('音樂長度須介於 1 秒與 15 分鐘之間。');
 const n=1024,hop=256,frames=Math.max(0,Math.floor((pcm.length-n)/hop)+1),flux=new Float32Array(frames),rms=new Float32Array(frames),re=new Float32Array(n),im=new Float32Array(n),previous=new Float32Array(n/2),window=new Float32Array(n);
 for(let i=0;i<n;i++)window[i]=.5-.5*Math.cos(2*Math.PI*i/(n-1));
 let maxFlux=0,maxEnergy=0;
 for(let f=0;f<frames;f++){
  let energy=0;for(let i=0;i<n;i++){const value=Number.isFinite(pcm[f*hop+i])?pcm[f*hop+i]:0;energy+=value*value;re[i]=value*window[i];im[i]=0;}
  rms[f]=Math.sqrt(energy/n);maxEnergy=Math.max(maxEnergy,rms[f]);
  for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){const a=re[i];re[i]=re[j];re[j]=a;}}
  for(let length=2;length<=n;length<<=1){const angle=-2*Math.PI/length,cr=Math.cos(angle),ci=Math.sin(angle);for(let base=0;base<n;base+=length){let wr=1,wi=0;for(let j=0;j<length/2;j++){const a=base+j,b=a+length/2,tr=wr*re[b]-wi*im[b],ti=wr*im[b]+wi*re[b];re[b]=re[a]-tr;im[b]=im[a]-ti;re[a]+=tr;im[a]+=ti;const next=wr*cr-wi*ci;wi=wr*ci+wi*cr;wr=next;}}}
  let rise=0;for(let k=2;k<n/2;k++){const mag=Math.log1p(Math.hypot(re[k],im[k])*8);rise+=Math.max(0,mag-previous[k]);previous[k]=mag;}flux[f]=rise;maxFlux=Math.max(maxFlux,rise);
  if(f%128===0)progress(f/Math.max(1,frames));
 }
 const events:MusicEvent[]=[],dt=hop/rate;
 for(let f=2;f<frames-2;f++){
  if(flux[f]<flux[f-1]||flux[f]<=flux[f+1]||rms[f]<Math.max(.002,maxEnergy*.035))continue;
  let sum=0,sum2=0,count=0;for(let j=Math.max(0,f-28);j<Math.min(frames,f+29);j++){if(Math.abs(j-f)<2)continue;sum+=flux[j];sum2+=flux[j]*flux[j];count++;}
  const mean=sum/Math.max(1,count),sd=Math.sqrt(Math.max(0,sum2/Math.max(1,count)-mean*mean)),threshold=mean+sd*.65;
  if(flux[f]<threshold||flux[f]<maxFlux*.06)continue;
  // Label the analysis window's centre, not its end or the time computation ran.
  const event={time:Math.max(0,f*dt+n/(2*rate)),strength:Math.min(1,.65*flux[f]/Math.max(.001,maxFlux)+.35*rms[f]/Math.max(.001,maxEnergy)),confidence:Math.min(1,.35+.65*(flux[f]-mean)/Math.max(.001,3*sd))};
  const last=events.at(-1);if(last&&event.time-last.time<.16){if(event.strength>last.strength)events[events.length-1]=event;}else events.push(event);
 }
 // Autocorrelation estimates periodicity, not a fabricated fixed beat map.
 const meanFlux=flux.reduce((sum,value)=>sum+value,0)/Math.max(1,frames);
 let best=0,bestLag=0;for(let lag=Math.round(60/190/dt);lag<=Math.round(60/65/dt);lag++){let dot=0,aa=0,bb=0;for(let f=lag;f<frames;f++){const a=flux[f]-meanFlux,b=flux[f-lag]-meanFlux;dot+=a*b;aa+=a*a;bb+=b*b;}const corr=dot/Math.max(1e-9,Math.sqrt(aa*bb));if(corr>best){best=corr;bestLag=lag;}}
 const confidence=events.length>=4?Math.min(1,best):0,bpm=confidence>=.35&&bestLag?Math.round(60/(bestLag*dt)):null;
 let strategy=bpm?'事件節拍 · BPM 為估計值':'稀疏高可信音樂事件 · 無穩定 BPM';
 if(events.length<2&&maxEnergy>.006){strategy='低信心：保守能量段落分布（非精準節拍）';for(let t=2;t<pcm.length/rate-.5;t+=1.2){const i=Math.min(frames-1,Math.floor(t/dt));if(rms[i]>Math.max(.006,maxEnergy*.15))events.push({time:t,strength:rms[i]/maxEnergy,confidence:.25});}}
 const sections=[];for(let t=0;t<pcm.length/rate;t+=8){const end=Math.min(pcm.length/rate,t+8);let energy=0,count=0;for(let f=Math.floor(t/dt);f<Math.min(frames,end/dt);f++){energy+=rms[f];count++;}sections.push({start:t,end,density:events.filter(e=>e.time>=t&&e.time<end).length/Math.max(1,end-t),energy:energy/Math.max(1,count)});}
 progress(1);return{duration:pcm.length/rate,bpm,confidence,strategy,events,sections};
}
