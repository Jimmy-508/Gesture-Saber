import {SaberScene} from './scene';
import {SaberScene as PreviousScene} from '../benchmarks/phase12-scene';
import {Metric} from './metrics';
import type {Pose,Point} from './gesture';
const host=document.querySelector<HTMLDivElement>('#view')!,out=document.querySelector<HTMLPreElement>('#result')!,button=document.querySelector<HTMLButtonElement>('#compare')!,demoButton=document.querySelector<HTMLButtonElement>('#demo')!;
let fixedScene:SaberScene|null=null;
const p=(x:number,y:number,z=0):Point=>({x,y,z});
function fixture(t:number,side:'Left'|'Right',time:number):Pose{
 const mirror=side==='Left'?1:-1,x=.5+mirror*(.2+Math.sin(t*3)*.1),y=.57+Math.cos(t*2)*.05,points=Array.from({length:21},()=>p(x,y));
 const angle=mirror*(.35+Math.sin(t*3)*.6),ax=Math.sin(angle)*.13,ay=-Math.cos(angle)*.13;
 points[0]=p(x,y);points[9]=p(x+ax,y+ay);points[5]=p(x+ax+.045,y+ay*.7);points[17]=p(x+ax-.045,y+ay*.7);
 return {side,points,open:true,time};
}
async function measure(Version:typeof SaberScene|typeof PreviousScene,label:string,demo=false){
 const scene=new Version(host);scene.setQuality('medium');scene.demo=demo;
 const frame=new Metric(),cpu=new Metric(),calls=new Metric();let prior=0,start=performance.now(),inputs=0,frames=0,seenLeft=0,seenRight=0,hidden=false;
 const producer=demo?null:setInterval(()=>{const now=performance.now();scene.update(fixture((now-start)/1000,'Left',now));scene.update(fixture((now-start)/1000,'Right',now));inputs++;},1000/24);
 const ticks=scene as unknown as {tick:()=>void},original=ticks.tick;
 const record=()=>{
  const now=performance.now(),elapsed=now-start;if(document.hidden)hidden=true;
  const began=performance.now();original();const duration=performance.now()-began;
  if(elapsed>=2000){if(prior)frame.add(now-prior);cpu.add(duration);calls.add(scene.renderer.info.render.calls);frames++;if(scene.sabers.Left.trail.geometry.drawRange.count>0)seenLeft++;if(scene.sabers.Right.trail.geometry.drawRange.count>0)seenRight++;}
  prior=now;
 };
 ticks.tick=record;
 await new Promise<void>(resolve=>{const timer=setInterval(()=>{if(performance.now()-start>=6000){clearInterval(timer);resolve();}},100);});
 if(producer)clearInterval(producer);const pixelRatio=scene.renderer.getPixelRatio();scene.dispose();const interval=frame.snapshot();return {label,viewport:[host.clientWidth,host.clientHeight],pixelRatio,input:'synthetic target 24 Hz mirrored landmarks',actualInputHz:inputs/((performance.now()-start)/1000),demo,valid:!hidden&&interval.mean<40,fps:interval.mean?1000/interval.mean:0,frameMs:interval,cpuFrameMs:cpu.snapshot(),drawCalls:calls.snapshot(),trailFrames:{left:seenLeft,right:seenRight,total:frames},gpuMs:'not measured'};
}
button.onclick=async()=>{fixedScene?.dispose();fixedScene=null;host.style.width=host.clientWidth+'px';button.disabled=demoButton.disabled=true;out.textContent='1.2 量測中…';try{const before=await measure(PreviousScene,'1.2');out.textContent=JSON.stringify(before,null,2)+'\n1.3 量測中…';const after=await measure(SaberScene,'1.3');out.textContent=JSON.stringify({before,after,warning:'Controlled rendering replay only. Not real camera, audio or tablet performance.'},null,2);}finally{button.disabled=demoButton.disabled=false;}};
demoButton.onclick=async()=>{button.disabled=demoButton.disabled=true;out.textContent='雙劍展示檢查中…';try{out.textContent=JSON.stringify(await measure(SaberScene,'1.3 demo',true),null,2);}finally{button.disabled=demoButton.disabled=false;}};
document.querySelector<HTMLButtonElement>('#fixed')!.onclick=()=>{
 fixedScene?.dispose();fixedScene=null;const results=[];let heldTime=0;
 for(const demo of [false,true]){
  let now=0;const scene=new SaberScene(host,undefined,false,()=>now);scene.setQuality('medium');scene.demo=demo;let left=0,right=0,input=0;
  const origin=now;
  for(let i=0;i<180;i++){
   now=origin+i*1000/60;
   if(!demo&&now>=origin+input*1000/24){const sample=origin+input*1000/24;scene.update(fixture(input/24,'Left',sample));scene.update(fixture(input/24,'Right',sample));input++;}
   scene.renderFrame(now);if(scene.sabers.Left.ribbon.vertices)left++;if(scene.sabers.Right.ribbon.vertices)right++;
  }
  results.push({mode:demo?'demo':'tracking landmark replay',frames:180,leftTrailFrames:left,rightTrailFrames:right,drawCalls:scene.renderer.info.render.calls,pass:left>100&&right>100});
  if(demo){fixedScene=scene;heldTime=now;}else scene.dispose();
 }
 out.textContent=JSON.stringify({method:'Fixed simulation steps through the real scene pipeline, not actual FPS or camera validation',results},null,2);
 // Present the held test-clock frame during a browser paint, after layout observers settle.
 requestAnimationFrame(()=>requestAnimationFrame(()=>fixedScene?.renderFrame(heldTime)));
};
window.addEventListener('pagehide',()=>fixedScene?.dispose());
