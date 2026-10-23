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

  // Only the native worker reformats ALL-CAPS words for audio; the
  // draft and other (Amy/Lessac) workers are never changed.
  // Letter-by-letter pronunciation is requested with dotted initials.
  const capitals = "HEY! STOP RIGHT THERE! FAFAFAFAD NASA FBI F.B.I. A.I. DON'T MOVE! I'M HERE. U.S.A. is a country. The mixedCase name stays.";
  await cleanMessage({type:'generate',id:100,text:capitals,speed:1});
  assert.equal(cleanEvents.at(-1).type,'tts-result');
  const lastSpeech = cleanCalls.filter(x=>x.url.endsWith('/speech')).at(-1);
  const capitalBody = JSON.parse(lastSpeech.options.body);
  assert.equal(capitalBody.input,
    "Hey! Stop Right There! Fafafafad Nasa Fbi F.B.I. A.I. Don't Move! I'm Here. U.S.A. is a country. The mixedCase name stays.");
  assert.equal(capitalBody.projectDisclosure,true);
  assert.ok(capitals.startsWith('HEY!'), 'draft text is still uppercase');

  // More focused regression inputs: periods denote initials and mixed-case
  // names and normal text must be retained byte-for-byte in the speech API.
  const probe = "F.B.I. U.S.B. HEY! ABC ABC's MIXED. NoChange iPhone.";
  await cleanMessage({type:'generate',id:101,text:probe,speed:1});
  assert.equal(cleanEvents.at(-1).type,'tts-result');
  const probeBody = JSON.parse(cleanCalls.filter(x=>x.url.endsWith('/speech')).at(-1).options.body);
  assert.equal(probeBody.input, "F.B.I. U.S.B. Hey! Abc Abc's Mixed. NoChange iPhone.");
  assert.equal(probeBody.voice,'fleurs-en');

  console.log('COSYVOICE WORKER: title-casing only native speech, dotted initialisms, narration and WAV checks passed');
})().catch(err=>{console.error(err);process.exitCode=1;});
