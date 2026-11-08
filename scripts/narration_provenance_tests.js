#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const root = process.argv[2] || '.';
const {markWav, markMp3} = require(path.resolve(root, 'web/narration-provenance.js'));

const wav = new ArrayBuffer(48);
const w = new DataView(wav);
for(const [at,str] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']]) {
  for(let i=0;i<str.length;i++)w.setUint8(at+i,str.charCodeAt(i));
}
w.setUint32(4,40,true);w.setUint32(16,16,true);
w.setUint16(20,1,true);w.setUint16(22,1,true);
w.setUint32(24,24000,true);w.setUint32(28,48000,true);
w.setUint16(32,2,true);w.setUint16(34,16,true);
w.setUint32(40,4,true);w.setInt16(44,12345,true);w.setInt16(46,-23456,true);
const encoded = markWav(wav);
const data = new Uint8Array(encoded);
const text = Buffer.from(data).toString('latin1');
assert.equal(new DataView(encoded).getUint32(4,true)+8,encoded.byteLength);
assert.equal(new DataView(encoded).getInt16(44,true),12345);
assert.equal(new DataView(encoded).getInt16(46,true),-23456);
assert.equal(text.slice(48,52),'LIST');
const listLen = new DataView(encoded).getUint32(52,true);
assert.equal(48+8+listLen,encoded.byteLength);
assert.equal(text.slice(56,60),'INFO');
assert.match(text,/AI_GENERATED=true/);
assert.match(text,/ISFT/);
assert.match(text,/ICMT/);
assert.equal(wav.byteLength,48);
assert.throws(()=>markWav(new ArrayBuffer(10)),/RIFF/);

const raw = Uint8Array.of(0xff,0xfb,0x90,0x64);
const parts = markMp3([raw]);
const tag = parts[0];
assert.equal(Buffer.from(tag.slice(0,3)).toString('ascii'),'ID3');
assert.equal(tag[3],3);
const size = (tag[6]<<21)|(tag[7]<<14)|(tag[8]<<7)|tag[9];
assert.equal(size+10,tag.length);
assert.equal(parts[1],raw,'audio must remain unmodified');
const labels = Buffer.from(tag).toString('latin1');
assert.match(labels,/AI_GENERATED\0true/);
assert.match(labels,/GENERATOR\0Read-Aloud/);
assert.match(labels,/AI_DISCLOSURE\0Disclose/);
console.log('PROVENANCE: WAV INFO and MP3 ID3 labels valid (not signed C2PA)');
