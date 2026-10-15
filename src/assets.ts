/** Download once with byte progress; consumers receive buffers, not a second network URL. */
export async function readAsset(url:string,label:string,signal:AbortSignal|undefined,report:(stage:string)=>void){
 report(`下載${label}：連線中`);const response=await fetch(url,{signal});if(!response.ok)throw Error(`${label} HTTP ${response.status}：${url}`);
 const reader=response.body?.getReader();if(!reader){const bytes=new Uint8Array(await response.arrayBuffer());report(`${label}下載完成：${(bytes.length/1048576).toFixed(1)} MB`);return bytes;}
 const chunks:Uint8Array[]=[];let length=0,last=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;chunks.push(value);const now=performance.now();if(now-last>500){report(`下載${label}：${(length/1048576).toFixed(1)} MB`);last=now;}}}finally{reader.releaseLock();}
 report(`${label}下載完成：${(length/1048576).toFixed(1)} MB`);
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
