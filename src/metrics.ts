export type Summary={mean:number;p95:number;peak:number;count:number};
export class Metric {
 private data=new Float64Array(240);private cursor=0;private count=0;
 add(value:number){if(Number.isFinite(value)&&value>=0){this.data[this.cursor]=value;this.cursor=(this.cursor+1)%this.data.length;this.count=Math.min(this.count+1,this.data.length);}}
 reset(){this.count=this.cursor=0;}
 snapshot():Summary{if(!this.count)return {mean:0,p95:0,peak:0,count:0};const values=Array.from(this.data.subarray(0,this.count)).sort((a,b)=>a-b);let total=0;for(const v of values)total+=v;return {mean:total/this.count,p95:values[Math.ceil(this.count*.95)-1],peak:values[this.count-1],count:this.count};}
}
export class ResolutionBudget {
 scale=1;private bad=0;private good=0;private changed=-Infinity;
 step(frameMs:number,seconds:number,now:number){
  this.bad=frameMs>23?this.bad+seconds:Math.max(0,this.bad-seconds);
  this.good=frameMs<18?this.good+seconds:0;
  if(now-this.changed<8000)return false;
  if(this.bad>=3&&this.scale>.7){this.scale=Math.max(.7,Math.round((this.scale-.1)*10)/10);this.bad=this.good=0;this.changed=now;return true;}
  if(this.good>=12&&this.scale<1){this.scale=Math.min(1,Math.round((this.scale+.1)*10)/10);this.bad=this.good=0;this.changed=now;return true;}return false;
 }
 reset(){this.scale=1;this.bad=this.good=0;this.changed=-Infinity;}
}
