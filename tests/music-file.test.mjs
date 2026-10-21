import {test} from 'node:test';import assert from 'node:assert/strict';
import {MUSIC_ACCEPT,validateMusicFile,validateMusicBytes} from '../src/music-file.ts';
const file=(name,type='')=>({name,type,size:100});
const atom=(kind,...parts)=>{const body=Buffer.concat(parts),b=Buffer.alloc(8);b.writeUInt32BE(body.length+8);b.write(kind,4);return Buffer.concat([b,body]);};
const handler=kind=>atom('trak',atom('mdia',atom('hdlr',Buffer.alloc(8),Buffer.from(kind),Buffer.alloc(4))));
const mp4=(video=false)=>Buffer.concat([atom('ftyp',Buffer.from('M4A '),Buffer.alloc(4)),atom('moov',handler('soun'),...(video?[handler('vide')]:[]))]);
const array=b=>Uint8Array.from(b).buffer;
test('explicit chooser allowlist and MIME/extension validation reject images, video and mismatches',()=>{
 assert.ok(!MUSIC_ACCEPT.includes('*'));
 for(const [name,type] of [['x.mp3','audio/mpeg'],['x.wav','audio/wav'],['x.M4A','audio/mp4'],['x.aac','audio/aac'],['x.mp3',''],['x.wav','application/octet-stream']])assert.doesNotThrow(()=>validateMusicFile(file(name,type)));
 for(const [name,type] of [['photo.jpg','image/jpeg'],['film.mp4','video/mp4'],['film.m4a','video/mp4'],['photo.mp3','image/png'],['song.mp3','audio/wav'],['a.txt','audio/mpeg']])assert.throws(()=>validateMusicFile(file(name,type)),/不接受/);
});
test('M4A accepts an audio-only container, rejects renamed audio+video MP4 and malformed atom sizes',()=>{
 assert.doesNotThrow(()=>validateMusicBytes(file('song.m4a','audio/mp4'),array(mp4())));
 assert.throws(()=>validateMusicBytes(file('renamed.m4a','audio/mp4'),array(mp4(true))),/包含影片/);
 assert.throws(()=>validateMusicBytes(file('bad.m4a'),array(Buffer.from('not audio'))),/無法讀取/);
 assert.throws(()=>validateMusicBytes(file('bad.wav'),array(Buffer.from('RIFFxxxxAVI '))),/純音訊/);
 assert.throws(()=>validateMusicBytes(file('photo.mp3'),array(Buffer.from([137,80,78,71]))),/純音訊/);
});
test('other previously decodable audio formats keep explicit filters; Ogg video streams are rejected',()=>{
 for(const [name,mime,bytes] of [['x.flac','audio/flac','fLaC'],['x.aiff','audio/aiff','FORMxxxxAIFF']])assert.doesNotThrow(()=>validateMusicBytes(file(name,mime),array(Buffer.from(bytes))));
 const page=header=>{const b=Buffer.alloc(28);b.write('OggS');b[5]=2;b[26]=1;b[27]=header.length;return Buffer.concat([b,Buffer.from(header)]);};
 assert.doesNotThrow(()=>validateMusicBytes(file('x.opus','audio/ogg'),array(page('OpusHead'))));
 assert.throws(()=>validateMusicBytes(file('movie.ogg','audio/ogg'),array(Buffer.concat([page('OpusHead'),page('\u0080theora')]))),/非音訊/);
});
