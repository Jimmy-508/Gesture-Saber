import type {Fist} from './twin-gesture.ts';
/** Blade command only. Unknown/missing data never becomes OPEN and never drives
 * identity, pose or tracking lifetime. Short confirmations prevent finger chatter. */
export class BladeCommand{
 active=false;lastReliable:Fist='UNKNOWN';evidence:Fist='UNKNOWN';
 private candidate:Fist='UNKNOWN';private since=-Infinity;private last=-Infinity;private count=0;
 reset(){this.active=false;this.lastReliable=this.evidence=this.candidate='UNKNOWN';this.since=this.last=-Infinity;this.count=0;}
 update(kind:Fist,now:number){if(!Number.isFinite(now)||now<=this.last)return;const gap=now-this.last;this.last=now;this.evidence=kind;
  if(kind==='UNKNOWN'){this.candidate='UNKNOWN';this.count=0;return;}
  if(kind!==this.candidate||gap>125){this.candidate=kind;this.since=now;this.count=1;}else this.count++;
  if(this.count>=2&&now-this.since>=(kind==='FIST'?60:80)){this.lastReliable=kind;this.active=kind==='FIST';}
 }
}
