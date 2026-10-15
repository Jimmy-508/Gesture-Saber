export type Engine<T, R> = {name:string; detect(input:T,time:number):Promise<R>; dispose():void};
/** Single owner: no concurrent initialization or inference; late engines are closed. */
export class FallbackPipeline<T,R> {
 engine:Engine<T,R>|null=null;
 private disposed=false; private fallbackUsed=false; private busy=false; private started=false;
 private worker:()=>Promise<Engine<T,R>>;private main:()=>Promise<Engine<T,R>>;private report:(message:string)=>void;
 constructor(worker:()=>Promise<Engine<T,R>>,main:()=>Promise<Engine<T,R>>,report:(message:string)=>void){this.worker=worker;this.main=main;this.report=report;}
 async init(forceMain=false){
  if(this.started||this.disposed)throw Error('Pipeline already initialized or disposed');this.started=true;
  if(forceMain){this.fallbackUsed=true;await this.install(this.main());return;}
  try{await this.install(this.worker());}catch(e){if(this.disposed)throw e;await this.fallback(e);}
 }
 private async install(pending:Promise<Engine<T,R>>){const engine=await pending;if(this.disposed){engine.dispose();throw Error('Session cancelled');}this.engine=engine;}
 private async fallback(reason:unknown){
  if(this.fallbackUsed||this.disposed)throw reason;
  this.fallbackUsed=true;this.engine?.dispose();this.engine=null;
  this.report('Worker 管線失敗，改用主執行緒：'+String(reason));
  await this.install(this.main());
 }
 async detect(input:T,time:number):Promise<R|null>{
  if(this.busy||this.disposed||!this.engine)return null;
  this.busy=true;
  try{return await this.engine.detect(input,time);}catch(e){
   if(this.disposed)throw e;
   await this.fallback(e);return null;
  }finally{this.busy=false;}
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.engine?.dispose();this.engine=null;}
}
export function cameraError(error:unknown,stage='permission'){
 const name=(error as {name?:string})?.name;
 if(name==='NotAllowedError'||name==='SecurityError')return '攝影機權限遭拒絕。請在網站權限允許攝影機後重試；若在其他 App 內開啟，請改用 Safari 或 Chrome。';
 if(name==='NotFoundError'||name==='OverconstrainedError')return '找不到可用的攝影機，或裝置不支援要求的影像格式。';
 if(name==='NotReadableError'||name==='AbortError')return '攝影機無法使用，可能正被其他應用程式占用，請關閉後重試。';
 return stage==='video'?'攝影機已取得，但無法播放或讀取影格。請回到前景並重新啟動。':'無法取得攝影機：'+String(error);
}
export async function withTimeout<T>(promise:Promise<T>,ms:number,label:string):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error(label)),ms);})]);}finally{clearTimeout(timer);}
}
/** Initialization deadlines follow real download progress, not total model size. */
export async function withActivityTimeout<T>(run:(touch:()=>void)=>Promise<T>,ms:number,label:string):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined,rejectTimeout:(e:Error)=>void=()=>{},finished=false;
 const timeout=new Promise<never>((_,reject)=>{rejectTimeout=reject;});
 const touch=()=>{if(finished)return;clearTimeout(timer);timer=setTimeout(()=>rejectTimeout(Error(label)),ms);};touch();
 try{return await Promise.race([run(touch),timeout]);}finally{finished=true;clearTimeout(timer);}
}
