#!/usr/bin/env node
'use strict';
// GPU-free regression for independent script directions and sentence cache keys.
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const root=process.argv[2]||'.';
const app=fs.readFileSync(root+'/web/app.js','utf8');
const start=app.indexOf('const ABBREVIATIONS');
const end=app.indexOf('/* ---------------------------------------------------------------- *\n * Sentence audio cache',start);
assert.ok(start>=0 && end>start,'segment and script parser source must be present');
const context={
  speed:{value:'1'},currentVoice:{id:'qwen',backend:'qwen3-local'},
  currentSpeaker:0,deliveryPreset:'natural',
  cosyvoiceProjectDisclosure:{checked:false},
  pitchFactor:()=>1,
  pronunciationDict:[],compiledDict:[],
};
vm.createContext(context);
vm.runInContext(app.slice(start,end),context,{filename:'app.js:segmentation'});
const seg=text=>vm.runInContext('buildSegments('+JSON.stringify(text)+',0,'+text.length+')',context);
const range=(text,start)=>vm.runInContext('buildSegments('+JSON.stringify(text)+','+start+','+text.length+')',context);
const parse=text=>vm.runInContext('scriptRegions('+JSON.stringify(text)+')',context);
const spoken=a=>Array.from(a,x=>x.text);
const check=(a,b)=>assert.deepEqual(JSON.parse(JSON.stringify(a)),b);

check(spoken(seg('Hello world. One more sentence.')),['Hello world.','One more sentence.']);
const script=[
  '⟦speaker=vivian⟧',
  '⟦acting="Terrified, barely breathing"⟧',
  'Sarah whispered. She listened.',
  '⟦speaker=ryan⟧',
  'James whispered.',
  '⟦speaker=vivian⟧',
  '⟦acting="Screaming in horror"⟧',
  'Sarah screamed.',
  '⟦acting=auto⟧',
  'Sarah took a breath.'
].join('\n');
const all=seg(script);
check(spoken(all),[
  'Sarah whispered.','She listened.','James whispered.',
  'Sarah screamed.','Sarah took a breath.'
]);
check(all.map(x=>[x.speaker,x.acting]),[
  ['vivian','Terrified, barely breathing'],
  ['vivian','Terrified, barely breathing'],
  ['ryan','Terrified, barely breathing'],
  ['vivian','Screaming in horror'],
  ['vivian','']
]);
assert.ok(all[0].key!==all[2].key);
assert.ok(all[0].key!==all[3].key);
assert.ok(all[3].key!==all[4].key);
assert.ok(!all.some(x=>/[⟦⟧]/.test(x.text)));
const middle=range(script,script.indexOf('James whispered.'));
check(spoken(middle),['James whispered.','Sarah screamed.','Sarah took a breath.']);
check(middle.map(x=>[x.speaker,x.acting]),[
  ['ryan','Terrified, barely breathing'],
  ['vivian','Screaming in horror'],
  ['vivian','']
]);
const altered=script.replace('Screaming in horror','Screaming in joy');
const changed=seg(altered);
assert.equal(all[0].key,changed[0].key,'unchanged earlier recordings must remain cache hits');
assert.equal(all[2].key,changed[2].key,'other speaker's recordings must remain cache hits');
assert.notEqual(all[3].key,changed[3].key,'the edited acting direction must change the affected cache key');
assert.equal(all[4].key,changed[4].key,'reset acting must retain the later recording');
const bad='Normal.\n⟦speaker=../../bad.wav⟧\nStill normal.\n⟦acting="not valid\nEnding.';
assert.equal(parse(bad).errors.length,2);
check(spoken(seg(bad)),['Normal.','Still normal.','Ending.']);
const escaped='\\⟦speaker=ryan⟧\nThis text remains.';
assert.equal(parse(escaped).errors.length,0,'escaped marker is ordinary prose');
const display='⟦acting="Crying with happiness, laughing softly"⟧\nShe laughed.';
assert.equal(seg(display)[0].acting,'Crying with happiness, laughing softly');
const other=vm.createContext({...context,currentVoice:{id:'amy',backend:'sherpa-wasm'}});
vm.runInContext(app.slice(start,end),other);
const wasm=vm.runInContext('buildSegments('+JSON.stringify(display)+',0,'+display.length+')',other);
assert.ok(!wasm[0].key.includes('qwen-direction:'),'WASM cache identity must not depend on acting');
console.log('SCRIPT DIRECTIONS: 20+ speaker, acting, cursor, reset and cache invariants passed.');
