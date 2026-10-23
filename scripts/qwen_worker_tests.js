#!/usr/bin/env node
'use strict';
// GPU-free Qwen worker contract and output validation.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const root=process.argv[2]||'.';
function sampleWav(){
  const n=1500,b=new ArrayBuffer(44+n*2),v=new DataView(b);
  const str=(at,s)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};
  str(0,'RIFF');v.setUint32(4,b.byteLength-8,true);str(8,'WAVE');
  str(12,'fmt ');v.setUint32(16,16,true);
  v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,24000,true);
  v.setUint32(28,48000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);
  str(36,'data');v.setUint32(40,n*2,true);
  for(let i=0;i<n;i++)v.setInt16(44+i*2,Math.floor(8000*Math.sin(i/20)),true);
  return b;
}
const calls=[],outputs=[];
let backend='ready',wav=sampleWav();
const self={postMessage(x){outputs.push(x)}};
async function fakeFetch(url,params){
  calls.push({url,params});
  if(url.endsWith('/status'))return {ok:true,json:async()=>({state:backend,message:'not ready'})};
  if(url.endsWith('/speech'))return {ok:true,arrayBuffer:async()=>wav};
  return {ok:false,status:404};
}
const context={self,fetch:fakeFetch,ArrayBuffer,DataView,Uint8Array,Float32Array,Set};
vm.runInNewContext(fs.readFileSync(root+'/web/qwen3-local.worker.js','utf8'),context,{
  filename:'qwen3-local.worker.js'
});
const msg=async x=>self.onmessage({data:x});
const last=()=>outputs.at(-1);
(async()=>{
  await msg({type:'generate',id:1,text:'Too early.',speed:1});
  assert.equal(last().type,'tts-error');
  assert.equal(last().id,1);
  await msg({type:'init',apiToken:'bad',nativeVoice:'vivian'});
  assert.equal(last().type,'tts-error');
  assert.match(last().message,/launcher/);
  await msg({type:'init',apiToken:'a'.repeat(48),nativeVoice:'vivian'});
  assert.equal(last().type,'tts-ready');
  await msg({type:'generate',id:2,text:'Sarah whispered.',speaker:'vivian',
    acting:'Terrified, barely breathing.',speed:1});
  assert.equal(last().type,'tts-result');
  assert.equal(last().id,2);
  assert.equal(last().samples.length,1500);
  const first=JSON.parse(calls.find(x=>x.url.endsWith('/speech')).params.body);
  assert.equal(first.input,'Sarah whispered.');
  assert.equal(first.acting,'Terrified, barely breathing.');
  assert.equal(first.voice,undefined,'Vivian should use proven startup preset');
  assert.equal(first.speed,1);
  assert.ok(!first.url&&!first.spoken_disclaimer&&!first.marking_attestation&&!first.speaker_identity);
  await msg({type:'generate',id:3,text:'James whispered.',speaker:'ryan',
    acting:'Terrified, barely breathing.',speed:1});
  assert.equal(last().type,'tts-result');
  const second=JSON.parse(calls.filter(x=>x.url.endsWith('/speech')).at(-1).params.body);
  assert.equal(second.voice,'ryan');
  assert.equal(second.acting,first.acting);
  await msg({type:'generate',id:4,text:'James stopped.',speaker:'ryan',acting:'',speed:1});
  const third=JSON.parse(calls.filter(x=>x.url.endsWith('/speech')).at(-1).params.body);
  assert.equal(last().type,'tts-result');
  assert.equal(third.voice,'ryan');
  assert.equal(third.acting,undefined);
  const totalCalls=calls.length;
  await msg({type:'generate',id:5,text:'Bad',speaker:'../clone',speed:1});
  assert.equal(last().type,'tts-error');
  assert.equal(last().id,5);
  assert.equal(calls.length,totalCalls,'unknown speaker must not be forwarded');
  wav=new ArrayBuffer(10);
  await msg({type:'generate',id:6,text:'Broken audio.',speaker:'vivian',speed:1});
  assert.equal(last().type,'tts-error');
  assert.match(last().message,/WAV/);
  console.log('QWEN WORKER: independent preset voices, acting, CSRF, and WAV validation passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
