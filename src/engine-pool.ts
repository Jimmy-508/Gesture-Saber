export type Resource={close():void};
export type Lease<T>={value:T;release():void;invalidate():void};
/** One model in the whole page, never a camera/video. Idle retention is bounded. */
export class EnginePool<T extends Resource>{
 private entry:{key:string;value:T}|null=null;private leased=false;private loading=false;private timer:ReturnType<typeof setTimeout>|undefined;
 private ttl:number;
 constructor(ttl=120000){this.ttl=ttl;}
 get state(){return this.entry?(this.leased?'active':'idle'):this.loading?'loading':'empty';}
 async acquire(key:string,create:()=>Promise<T>,signal:AbortSignal,report:(s:string)=>void=()=>{}):Promise<Lease<T>>{
  if(signal.aborted)throw new DOMException('cancelled','AbortError');
  if(this.leased||this.loading)throw Error('辨識引擎仍在釋放，請稍後重新啟動');
  clearTimeout(this.timer);this.timer=undefined;
  if(this.entry?.key!==key)this.clear();
  if(signal.aborted)throw new DOMException('cancelled','AbortError');
  if(!this.entry){this.loading=true;try{const value=await create();if(signal.aborted){value.close();throw new DOMException('cancelled','AbortError');}this.entry={key,value};}finally{this.loading=false;}}
  else report('重用已初始化的辨識引擎（未重新下載或初始化）');
  this.leased=true;const entry=this.entry;let released=false;
  const finish=(invalid:boolean)=>{if(released)return;released=true;this.leased=false;if(invalid){this.clear();return;}this.timer=setTimeout(()=>this.clear(),this.ttl);};
  return {value:entry.value,release:()=>finish(false),invalidate:()=>finish(true)};
 }
 clear(){clearTimeout(this.timer);this.timer=undefined;const entry=this.entry;this.entry=null;entry?.value.close();}
}
