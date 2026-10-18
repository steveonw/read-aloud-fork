#!/usr/bin/env node
'use strict';
// M1 contract tests: the adapter must preserve the original WASM transport,
// plus safely normalize a future native/mock backend into the same UI events.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const dir = process.argv[2] || '.';

const workers = [];
class FakeWorker {
  constructor(file, options) {
    this.file = file;
    this.options = options;
    this.messages = [];
    this.terminated = false;
    this.onmessage = null;
    this.onerror = null;
    workers.push(this);
  }
  postMessage(msg, transfer) { this.messages.push({msg, transfer}); }
  terminate() { this.terminated = true; }
  emit(msg) {
    if (typeof this.onmessage === 'function') this.onmessage({data: msg});
  }
}
const context = {Worker: FakeWorker};
vm.runInNewContext(fs.readFileSync(dir + '/web/tts-backends.js', 'utf8'), context, {
  filename: 'tts-backends.js'
});
const adapter = context.ReadAloudTTS;
let total = 0;
let failures = 0;
function check(name, fn) {
  total++;
  try { fn(); console.log('PASS', name); }
  catch (err) { failures++; console.error('FAIL', name, err.message); }
}

check('default provider is Sherpa WASM', () => {
  assert.equal(adapter.DEFAULT_BACKEND, 'sherpa-wasm');
  assert.ok(adapter.listBackends().includes('sherpa-wasm'));
});
let wasm, original;
check('WASM creates the unchanged module worker path', () => {
  wasm = adapter.createVoiceWorker({id: 'amy-medium'});
  original = workers.at(-1);
  assert.equal(original.file, 'sherpa-onnx-tts.worker.js');
  assert.equal(original.options.type, 'module');
});
check('init and generate payloads keep their request IDs and text', () => {
  const init = {type:'init',voiceId:'amy-medium'};
  const job = {type:'generate',id:13,text:'One sentence.',sid:0,speed:1};
  wasm.postMessage(init);
  wasm.postMessage(job);
  assert.equal(original.messages[0].msg, init);
  assert.equal(original.messages[1].msg, job);
});
const wasmReceived = [];
wasm.onmessage = (event) => wasmReceived.push(event.data);
check('original ready and result events pass through untouched', () => {
  const ready = {type:'sherpa-onnx-tts-ready',numSpeakers:1};
  const result = {type:'sherpa-onnx-tts-result',id:13,samples:new Float32Array([0.5]),sampleRate:22050};
  original.emit(ready); original.emit(result);
  assert.equal(wasmReceived[0], ready);
  assert.equal(wasmReceived[1], result);
});
check('provider validation rejects unexpected IDs and duplicate registration', () => {
  assert.throws(() => adapter.registerBackend('__proto__', () => {}), /Invalid/);
  assert.throws(() => adapter.registerBackend('sherpa-wasm', () => {}), /already/);
  assert.throws(() => adapter.registerBackend('bad', null), /factory/);
});
check('unknown provider fails visibly instead of switching voices silently', () => {
  assert.throws(() => adapter.createVoiceWorker({backend:'cosyvoice3-not-installed'}), /not available/);
});
check('mock native provider can be registered without changing the proofreader', () => {
  adapter.registerBackend('mock-native', (Ctor) => new Ctor('mock-native-tts.worker.js', {type:'module'}));
  assert.ok(adapter.listBackends().includes('mock-native'));
});
const native = adapter.createVoiceWorker({id:'narrator',backend:'mock-native'});
const rawNative = workers.at(-1);
const nativeReceived = [];
native.onmessage = e => nativeReceived.push(e.data);
check('native ready/progress normalize into existing UI message protocol', () => {
  rawNative.emit({type:'tts-progress',status:'Warming up'});
  rawNative.emit({type:'tts-ready',numSpeakers:1});
  assert.equal(nativeReceived[0].type, 'sherpa-onnx-tts-progress');
  assert.equal(nativeReceived[0].status, 'Warming up');
  assert.equal(nativeReceived[1].type, 'sherpa-onnx-tts-ready');
});
check('native out-of-order results preserve original request IDs and PCM data', () => {
  native.postMessage({type:'generate',id:27,text:'Later sentence.',speed:1,sid:0});
  native.postMessage({type:'generate',id:26,text:'Earlier sentence.',speed:1,sid:0});
  const samples = new Float32Array([0.1,-0.1]);
  rawNative.emit({type:'tts-result',id:27,samples,sampleRate:24000});
  rawNative.emit({type:'tts-result',id:26,samples,sampleRate:24000});
  assert.equal(nativeReceived[2].type,'sherpa-onnx-tts-result');
  assert.equal(nativeReceived[2].id,27);
  assert.equal(nativeReceived[3].id,26);
  assert.equal(nativeReceived[2].samples,samples);
  assert.equal(nativeReceived[2].sampleRate,24000);
});
check('native error IDs and plain-worker errors reach the existing handler', () => {
  rawNative.emit({type:'tts-error',id:27,message:'Out of GPU memory'});
  assert.equal(nativeReceived.at(-1).type,'error');
  assert.equal(nativeReceived.at(-1).id,27);
  let err;
  native.onerror = e => {err=e;};
  rawNative.onerror({message:'worker died'});
  assert.equal(err.message,'worker died');
});
check('terminate drops late replies and blocks new synthesis', () => {
  const staleHandler=rawNative.onmessage;
  const numReceived=nativeReceived.length;
  native.terminate();
  assert.equal(rawNative.terminated,true);
  staleHandler({data:{type:'tts-result',id:28}});
  assert.equal(nativeReceived.length,numReceived);
  assert.throws(() => native.postMessage({type:'generate',id:28}),/terminated/);
  native.terminate();
});
check('malformed reply surfaces as a structured error', () => {
  assert.equal(adapter.normalizeMessage(null).type,'error');
  assert.match(adapter.normalizeMessage(null).message,/Invalid/);
});
wasm.terminate();
console.log('\nBACKEND ADAPTER: ' + (total-failures) + '/' + total + ' checks passed');
if (failures) process.exit(1);
