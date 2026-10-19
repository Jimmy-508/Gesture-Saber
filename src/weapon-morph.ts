import {Quaternion} from 'three';
export type MorphPhase='READY'|'RETRACT'|'ALIGN'|'EXTEND';
/** One bounded transform transition, then the normal controller output is direct. */
export class WeaponMorph{
 phase:MorphPhase='READY';twin=false;front=1;rear=0;gold=0;on=true;
 private since=-Infinity;private fromFront=1;private fromRear=0;private fromGold=0;private startQ=new Quaternion();private targetQ=new Quaternion();private turning=false;
 reset(){this.phase='READY';this.twin=false;this.front=1;this.rear=this.gold=0;this.on=true;this.since=-Infinity;this.turning=false;}
 begin(twin:boolean,now:number,rotation:Quaternion){this.step(now);this.fromFront=this.front;this.fromRear=this.rear;this.fromGold=this.gold;this.twin=twin;this.since=now;this.startQ.copy(rotation);this.phase='RETRACT';this.turning=true;this.on=false;}
 get transitioning(){return this.phase!=='READY';}
 step(now:number){if(!Number.isFinite(this.since))return;const t=Math.max(0,now-this.since);
  if(t<120){this.phase='RETRACT';this.front=this.fromFront*(1-t/120);this.rear=this.fromRear*(1-t/120);this.gold=this.fromGold;this.on=false;}
  else if(t<180){this.phase='ALIGN';this.front=this.rear=0;const a=(t-120)/60;this.gold=this.fromGold+((this.twin?1:0)-this.fromGold)*a;this.on=false;}
  else{this.front=Math.min(1,(t-180)/160);this.rear=this.twin?this.front:0;this.gold=this.twin?1:0;this.on=true;this.phase=t<340?'EXTEND':'READY';}
 }
 orient(output:Quaternion,target:Quaternion,now:number){if(!this.turning){output.copy(target);return;}this.targetQ.copy(target);const a=Math.max(0,Math.min(1,(now-this.since)/180));output.slerpQuaternions(this.startQ,this.targetQ,a*a*(3-2*a));if(a===1)this.turning=false;}
}
