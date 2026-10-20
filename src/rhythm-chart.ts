export type MusicEvent={time:number;strength:number;confidence:number};
export type MusicAnalysis={duration:number;bpm:number|null;confidence:number;strategy:string;events:MusicEvent[];sections:{start:number;end:number;density:number;energy:number}[]};
export type TargetEvent={id:number;hitTime:number;spawnTime:number;travelDuration:number;x:number;y:number;strength:number};
export const TRAVEL=1.65,HIT_WINDOW=.22,PERFECT_WINDOW=.095,HIT_Z=0,FLIGHT_DEPTH=18,TARGET_RADIUS=.42;
/** Actual onsets are retained; BPM is descriptive and never creates a fixed grid. */
export function makeChart(analysis:MusicAnalysis):TargetEvent[]{
 const selected:MusicEvent[]=[];
 for(const e of analysis.events){if(!Number.isFinite(e.time)||e.time<TRAVEL+.15||e.time>analysis.duration-.25||e.confidence<.2)continue;
  const prev=selected.at(-1),gap=analysis.confidence<.35?.85:.62;
  if(prev&&e.time-prev.time<gap){if(e.strength>prev.strength*1.15&&(!selected.at(-2)||e.time-selected.at(-2)!.time>=gap))selected[selected.length-1]=e;continue;}selected.push(e);
 }
 let lane=2;return selected.map((e,i)=>{const direction=Math.sin(i*2.399+e.strength)>.0?1:-1;lane=Math.max(0,Math.min(4,lane+direction));return{id:i,hitTime:e.time,spawnTime:e.time-TRAVEL,travelDuration:TRAVEL,x:(lane-2)*.8,y:.55+((i*7)%3)*.55,strength:e.strength};});
}
export function targetZ(event:TargetEvent,time:number){const u=(time-event.hitTime)/event.travelDuration;return HIT_Z+FLIGHT_DEPTH*(.08*u+.92*u*Math.abs(u));}
export type Judgement='Perfect'|'Good'|'Miss'|'Safe';
export class ScoreBoard{
 score=0;combo=0;bestCombo=0;perfect=0;good=0;miss=0;safe=0;judgement='';revision=0;
 reset(){this.score=this.combo=this.bestCombo=this.perfect=this.good=this.miss=this.safe=0;this.judgement='';this.revision++;}
 apply(kind:Judgement){if(kind==='Perfect'||kind==='Good'){this.score+=kind==='Perfect'?100:50;this.combo++;this.bestCombo=Math.max(this.bestCombo,this.combo);if(kind==='Perfect')this.perfect++;else this.good++;}else if(kind==='Miss'){this.miss++;this.combo=0;}else this.safe++;this.judgement=kind==='Safe'?'變形保護':kind;this.revision++;}
}
