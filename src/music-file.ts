export const MAX_FILE_BYTES=64*1024*1024;
const formats:Record<string,string[]>={mp3:['audio/mpeg','audio/mp3'],wav:['audio/wav','audio/x-wav','audio/wave','audio/vnd.wave'],wave:['audio/wav','audio/x-wav','audio/wave','audio/vnd.wave'],m4a:['audio/mp4','audio/x-m4a'],aac:['audio/aac','audio/aacp','audio/x-aac'],flac:['audio/flac','audio/x-flac'],ogg:['audio/ogg','application/ogg'],oga:['audio/ogg','application/ogg'],opus:['audio/ogg','audio/opus'],aif:['audio/aiff','audio/x-aiff'],aiff:['audio/aiff','audio/x-aiff']};
export const MUSIC_ACCEPT=[...Object.keys(formats).map(ext=>'.'+ext),...new Set(Object.values(formats).flat())].join(',');
type MusicFile={size:number;name:string;type?:string};
export function validateMusicFile(file:MusicFile){
 if(!file.size)throw Error('音樂檔案是空的。');if(file.size>MAX_FILE_BYTES)throw Error('音樂檔案超過 64 MB，請選擇較小的檔案。');
 const ext=file.name.split('.').pop()?.toLowerCase()??'',mime=(file.type??'').split(';')[0].trim().toLowerCase();
 if(!formats[ext]||mime&&mime!=='application/octet-stream'&&!formats[ext].includes(mime))throw Error('請選擇支援的音訊檔案，不接受圖片或影片。');
 return ext;
}
// Inspect the container before decodeAudioData: that API can otherwise extract
// an audio track from a renamed video. Decoder support remains the final check.
export function validateMusicBytes(file:MusicFile,bytes:ArrayBuffer){
 const ext=validateMusicFile(file),v=new DataView(bytes),n=v.byteLength;
 const text=(p:number,length:number)=>p+length<=n?String.fromCharCode(...new Uint8Array(bytes,p,length)):'';
 let valid=false;
 if(ext==='wav'||ext==='wave')valid=text(0,4)==='RIFF'&&text(8,4)==='WAVE';
 if(ext==='mp3')valid=text(0,3)==='ID3'||n>=2&&v.getUint8(0)===255&&(v.getUint8(1)&0xe6)===0xe2;
 if(ext==='aac')valid=n>=2&&v.getUint8(0)===255&&(v.getUint8(1)&0xf6)===0xf0;
 if(ext==='flac')valid=text(0,4)==='fLaC';
 if(ext==='aif'||ext==='aiff')valid=text(0,4)==='FORM'&&['AIFF','AIFC'].includes(text(8,4));
 if(['ogg','oga','opus'].includes(ext)){
  let streams=0,p=0;
  while(p<n){
   if(p+27>n||text(p,4)!=='OggS')throw Error('無法讀取此音樂檔案。');
   const count=v.getUint8(p+26),body=p+27+count;if(body>n)throw Error('無法讀取此音樂檔案。');
   let size=0;for(let i=0;i<count;i++)size+=v.getUint8(p+27+i);
   if(body+size>n)throw Error('無法讀取此音樂檔案。');
   if(v.getUint8(p+5)&2){
    if(!(text(body,7)==='\u0001vorbis'||text(body,8)==='OpusHead'||text(body,5)==='\u007fFLAC'))throw Error('此容器含非音訊內容，請改選純音訊檔案。');streams++;
   }
   p=body+size;
  }
  valid=streams>0;
 }
 if(ext==='m4a'){
  let sound=false,video=false,brand=false;
  function atoms(start:number,end:number,depth=0){
   if(depth>4)throw Error('無法讀取此音樂檔案。');
   for(let p=start;p<end;){
    if(p+8>end)throw Error('無法讀取此音樂檔案。');
    let size=v.getUint32(p),header=8;const kind=text(p+4,4);
    if(size===1){if(p+16>end)throw Error('無法讀取此音樂檔案。');size=v.getUint32(p+8)*4294967296+v.getUint32(p+12);header=16;}
    if(size===0)size=end-p;
    if(!Number.isSafeInteger(size)||size<header||p+size>end)throw Error('無法讀取此音樂檔案。');
    if(kind==='ftyp')brand=true;
    if(kind==='hdlr'&&size>=header+12){const handler=text(p+header+8,4);sound||=handler==='soun';video||=handler==='vide';}
    if(kind==='moov'||kind==='trak'||kind==='mdia')atoms(p+header,p+size,depth+1);
    p+=size;
   }
  }
  atoms(0,n);if(video)throw Error('此檔案包含影片，請改選純音訊檔案。');valid=brand&&sound;
 }
 if(!valid)throw Error('檔案內容不是支援的純音訊格式，請重新選擇音樂。');
}
