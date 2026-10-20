#!/usr/bin/env node
'use strict';
// Pure-Node, GPU-free browser-worker contract tests for the optional local
// CosyVoice GGUF engine. The server is mocked; this never downloads any model.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const root = process.argv[2] || '.';

function makeWav({rate=24000, samples=1500, constant=false, clipped=false, truncated=false, extraChunk=false}={}) {
  const junk = extraChunk ? 12 : 0;
  const buffer = new ArrayBuffer(44 + samples * 2 + junk);
  const v = new DataView(buffer);
  const str = (at, word) => { for(let i=0;i<word.length;i++) v.setUint8(at+i,word.charCodeAt(i)); };
  str(0,'RIFF');v.setUint32(4,buffer.byteLength-8,true);str(8,'WAVE');
  let offset = 12;
  if (extraChunk) {
    str(offset,'JUNK');v.setUint32(offset+4,4,true);
    offset += 12;
  }
  str(offset,'fmt ');v.setUint32(offset+4,16,true);
  v.setUint16(offset+8,1,true);v.setUint16(offset+10,1,true);
  v.setUint32(offset+12,rate,true);v.setUint32(offset+16,rate*2,true);
  v.setUint16(offset+20,2,true);v.setUint16(offset+22,16,true);
  offset+=24;
  str(offset,'data');v.setUint32(offset+4,samples*2,true);
  for (let i=0;i<samples;i++) {
    v.setInt16(offset+8+i*2,clipped?32767:constant?0:Math.round(9000*Math.sin(i/15)),true);
  }
  if (truncated) v.setUint32(offset+4,samples*2+8,true);
  return buffer;
}

const emitted=[];
const calls=[];
let speechOutput=makeWav({extraChunk:true});
let ready={state:'ready',reason:'local_cosyvoice_running'};
const self={
  postMessage(message,transfer){emitted.push({message,transfer});},
};
async function mockFetch(url, options) {
  calls.push({url,options});
  if(url==='/api/tts/cosyvoice/status')return {ok:true,json:async()=>ready};
  if(url==='/api/tts/cosyvoice/speech')return {ok:true,arrayBuffer:async()=>speechOutput};
  return {ok:false,status:404};
}
const context = {self, fetch:mockFetch, ArrayBuffer, DataView, Uint8Array, Float32Array};
vm.runInNewContext(fs.readFileSync(root+'/web/cosyvoice-local.worker.js','utf8'),context,{filename:'cosyvoice-local.worker.js'});

function last(){return emitted.at(-1)?.message;}
const msg=async data=>await self.onmessage({data});

(async()=>{
  await msg({type:'generate',id:1,text:'early',speed:1});
  assert.equal(last().type,'tts-error');
  assert.equal(last().id,1);
  await msg({type:'init',apiToken:'bad',nativeVoice:'fleurs-en',
    consentAttestation:'I have the rights to use this voice'});
  assert.equal(last().type,'tts-error');
  assert.match(last().message,/launcher/);
  const apiToken='a'.repeat(48);
  await msg({type:'init',apiToken,nativeVoice:'fleurs-en',
    consentAttestation:'I have the rights to use this voice'});
  assert.equal(last().type,'tts-ready');
  assert.equal(last().numSpeakers,1);
  await msg({type:'generate',id:23,text:'The storm was coming.',speed:1});
  assert.equal(last().type,'tts-result');
  assert.equal(last().id,23);
  assert.equal(last().sampleRate,24000);
  assert.equal(last().samples.length,1500);
  assert.ok(last().samples.some(x=>x>0.1));
  assert.equal(last().samples.buffer.byteLength,1500*4);
  const req=calls.find(x=>x.url.endsWith('/speech'));
  assert.equal(req.options.headers['X-RA-Token'],apiToken);
  assert.equal(req.options.credentials,'same-origin');
  const body=JSON.parse(req.options.body);
  assert.equal(body.input,'The storm was coming.');
  assert.equal(body.voice,'fleurs-en');
  assert.equal(body.speed,1);
  assert.equal(body.consentAttestation,'I have the rights to use this voice');
  assert.ok(!body.url && !body.spoken_disclaimer && !body.marking_attestation);
  assert.equal(body.projectDisclosure,false);

  for(const [name,input,pattern] of [
    ['constant',makeWav({constant:true}),/silent|constant/],
    ['clipped',makeWav({clipped:true}),/clipped/],
    ['unsupported rate',makeWav({rate:22050}),/24 kHz/],
    ['truncated',makeWav({truncated:true}),/truncated/],
    ['invalid',new ArrayBuffer(50),/RIFF WAV/]
  ]) {
    speechOutput=input;
    await msg({type:'generate',id:30,text:name,speed:1});
    assert.equal(last().type,'tts-error',name);
    assert.equal(last().id,30,name);
    assert.match(last().message,pattern,name);
  }

  const cleanCalls = [];
  const cleanEvents = [];
  const cleanSelf = {postMessage(message){ cleanEvents.push(message); }};
  const cleanWorld = {
    self: cleanSelf,
    fetch: async (url, options) => {
      cleanCalls.push({url,options});
      if(url.endsWith('/status'))return {ok:true,json:async()=>({state:'ready'})};
      return {ok:true,arrayBuffer:async()=>makeWav()};
    },
    ArrayBuffer, DataView, Uint8Array, Float32Array
  };
  vm.runInNewContext(fs.readFileSync(root+'/web/cosyvoice-local.worker.js','utf8'),cleanWorld);
  const cleanMessage = async data => cleanSelf.onmessage({data});
  await cleanMessage({type:'init',apiToken,nativeVoice:'fleurs-en',
    consentAttestation:'I have the rights to use this voice', projectDisclosure:true});
  assert.equal(cleanEvents.at(-1).type,'tts-ready');
  await cleanMessage({type:'generate',id:99,text:'Test.',speed:1});
  assert.equal(cleanEvents.at(-1).type,'tts-result');
  const cleanBody = JSON.parse(cleanCalls.find(x=>x.url.endsWith('/speech')).options.body);
  assert.equal(cleanBody.projectDisclosure,true);
  assert.ok(!('marking_attestation' in cleanBody) && !('spoken_disclaimer' in cleanBody));

  // The native engine tends to spell all-uppercase text. Fix audible text
  // while preserving true initialisms, mixed case, punctuation and contractions.
  const capitals = "HEY! STOP RIGHT THERE! ADFASDFA NASA FBI USB AI PDF. DON'T MOVE! I'M HERE. U.S.A. is a country.";
  await cleanMessage({type:'generate',id:100,text:capitals,speed:1});
  assert.equal(cleanEvents.at(-1).type,'tts-result');
  const lastSpeech = cleanCalls.filter(x=>x.url.endsWith('/speech')).at(-1);
  const capitalBody = JSON.parse(lastSpeech.options.body);
  assert.equal(capitalBody.input,
    "hey! stop right there! adfasdfa nasa FBI USB AI PDF. don't move! I'm here. U.S.A. is a country.");
  assert.equal(capitalBody.projectDisclosure,true);
  assert.equal(capitals.startsWith('HEY!'),true,'draft text remains unchanged');

  // Case selection cannot affect default/other worker backends because the
  // transformation lives in CosyVoice's own worker, not the editor pipeline.
  console.log('COSYVOICE WORKER: capitals, initialisms, native narration and WAV checks passed');
})().catch(err=>{console.error(err);process.exitCode=1;});
