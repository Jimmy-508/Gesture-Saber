import {Quaternion} from 'three';
export type MorphPhase='READY'|'RETRACT'|'ALIGN'|'EXTEND';
/** One bounded transform transition, then the normal controller output is direct. */
export class WeaponMorph{
 phase:MorphPhase='READY';twin=false;front=1;rear=0;gold=0;on=true;
 private since=-Infinity;private fromFront=1;private fromRear=0;private fromGold=0;private startQ=new Quaternion();private targetQ=new Quaternion();private turning=false;
 private requested=true;private bladeFrom=1;private bladeTarget=true;private bladeSince=-Infinity;private extending=false;private retractMs=120;
 reset(single=true){this.phase='READY';this.twin=false;this.front=single?1:0;this.rear=this.gold=0;this.on=this.requested=this.bladeTarget=single;this.bladeFrom=this.front;this.since=this.bladeSince=-Infinity;this.turning=this.extending=false;}
 begin(twin:boolean,now:number,rotation:Quaternion,turn=true){this.step(now);this.fromFront=this.front;this.fromRear=this.rear;this.fromGold=this.gold;this.twin=twin;this.since=now;this.startQ.copy(rotation);this.retractMs=Math.max(this.front,this.rear)>.001?120:0;this.phase=this.retractMs?'RETRACT':'ALIGN';this.turning=turn;this.extending=false;this.on=false;}
 get transitioning(){return this.phase!=='READY';}
 private blade(now:number){const target=this.bladeTarget?1:0,t=Number.isFinite(this.bladeSince)?Math.max(0,Math.min(1,(now-this.bladeSince)/(this.bladeTarget?160:120))):1;return this.bladeFrom+(target-this.bladeFrom)*t;}
 private aim(on:boolean,now:number){if(on===this.bladeTarget)return;this.bladeFrom=this.blade(now);this.bladeSince=now;this.bladeTarget=on;}
 step(now:number,single=this.requested){this.requested=single;
  if(this.phase==='READY'){this.aim(this.twin||single,now);this.front=this.blade(now);this.rear=this.twin?this.front:0;this.gold=this.twin?1:0;this.on=this.twin||single;return;}
  const t=Math.max(0,now-this.since),extendAt=this.retractMs+60;
  if(t<this.retractMs){this.phase='RETRACT';this.front=this.fromFront*(1-t/this.retractMs);this.rear=this.fromRear*(1-t/this.retractMs);this.gold=this.fromGold;this.on=false;}
  else if(t<extendAt){this.phase='ALIGN';this.front=this.rear=0;const a=(t-this.retractMs)/60;this.gold=this.fromGold+((this.twin?1:0)-this.fromGold)*a;this.on=false;}
  else{
   if(!this.extending){this.extending=true;this.bladeFrom=0;this.bladeTarget=this.twin||single;this.bladeSince=this.since+extendAt;}
   this.aim(this.twin||single,now);this.front=this.blade(now);this.rear=this.twin?this.front:0;this.gold=this.twin?1:0;this.on=this.twin||single;this.phase=t<extendAt+160?'EXTEND':'READY';
  }
 }
 orient(output:Quaternion,target:Quaternion,now:number){if(!this.turning){output.copy(target);return;}this.targetQ.copy(target);const a=Math.max(0,Math.min(1,(now-this.since)/(this.retractMs+60)));output.slerpQuaternions(this.startQ,this.targetQ,a*a*(3-2*a));if(a===1)this.turning=false;}
}
