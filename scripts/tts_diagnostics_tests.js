#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const root = process.argv[2] || '.';
const script = fs.readFileSync(root + '/web/tts-diagnostics.js', 'utf8');
const sample = {
  schema: 'readaloud-studio/tts-capabilities@0.1',
  gpu: {
    state: 'detected', reason: 'gpu_detected_memory_unverified',
    devices: [{name: 'NVIDIA GeForce GTX 1650', driver: '565.90', vramTotalMiB: 4096, vramFreeMiB: 3000}],
  },
  backends: [
    {id: 'sherpa-wasm', state: 'ready', canTry: true},
    {id: 'cosyvoice3-local', state: 'unavailable', reason: 'server_not_ready', canTry: false},
  ],
};

function makeWorld(responder) {
  const listeners = {};
  const button = {
    disabled: false,
    addEventListener(name, callback) {listeners[name] = callback;},
  };
  const output = {textContent: '', innerHTML: undefined};
  let called = [];
  class AbortControllerMock {
    constructor() { this.signal = {}; }
    abort() { this.signal.aborted = true; }
  }
  const ctx = {
    document: {getElementById(id) {
      return id === 'gpuProbeButton' ? button : id === 'gpuProbeStatus' ? output : null;
    }},
    fetch: async (path, opts) => {
      called.push({path,opts});
      return responder(path, opts);
    },
    AbortController: AbortControllerMock,
    setTimeout: () => 1,
    clearTimeout: () => {},
  };
  vm.runInNewContext(script, ctx, {filename: 'tts-diagnostics.js'});
  return {button,output,click: listeners.click,called};
}
const jsonResponse = (data) => ({ok: true, json: async () => data});
let passed = 0;
let total = 0;
async function check(label, fn) {
  total++;
  try {
    await fn();
    passed++;
    console.log('PASS', label);
  } catch (e) {console.error('FAIL', label, e.stack || e);}
}

(async () => {
  await check('check is opt-in; script does not fetch at startup', async () => {
    const w=makeWorld(async () => jsonResponse(sample));
    assert.equal(w.called.length,0);
    assert.equal(typeof w.click,'function');
  });
  await check('detected GPU reports total/free VRAM without claiming model fit', async () => {
    const w=makeWorld(async () => jsonResponse(sample));
    await w.click();
    assert.match(w.output.textContent,/GTX 1650/);
    assert.match(w.output.textContent,/4096 MiB total/);
    assert.match(w.output.textContent,/3000 MiB free/);
    assert.match(w.output.textContent,/CosyVoice local server not running/);
    assert.equal(w.called[0].path,'/api/tts/capabilities');
    assert.equal(w.called[0].opts.cache,'no-store');
    assert.equal(w.button.disabled,false);
  });
  await check('missing GPU utility is reported as unknown, not no GPU', async () => {
    const input={...sample,gpu:{state:'unknown',reason:'gpu_probe_unavailable',devices:[]}};
    const w=makeWorld(async () => jsonResponse(input));
    await w.click();
    assert.match(w.output.textContent,/detection unavailable/);
  });
  await check('negative GPU report is explained without killing proofreader', async () => {
    const input={...sample,gpu:{state:'unavailable',reason:'no_nvidia_device_reported',devices:[]}};
    const w=makeWorld(async () => jsonResponse(input));
    await w.click();
    assert.match(w.output.textContent,/No NVIDIA GPU reported/);
    assert.match(w.output.textContent,/Portable proofreading remains available/);
  });
  await check('no raw HTML markup is rendered into the status element', async () => {
    const input={...sample,gpu:{state:'detected',devices:[{name:'<script>alert(1)</script>',vramTotalMiB:1}]}};
    const w=makeWorld(async () => jsonResponse(input));
    await w.click();
    assert.match(w.output.textContent,/script/);
    assert.equal(w.output.innerHTML,undefined);
  });
  await check('remote/unavailable endpoint failure keeps portable mode usable', async () => {
    const w=makeWorld(async () => {throw new Error('offline');});
    await w.click();
    assert.match(w.output.textContent,/GPU check unavailable/);
    assert.match(w.output.textContent,/Portable proofreading is unaffected/);
    assert.equal(w.button.disabled,false);
  });
  await check('wrong response schema is rejected rather than treated as ready', async () => {
    const w=makeWorld(async () => jsonResponse({schema:'not-cosyvoice',backends:[]}));
    await w.click();
    assert.match(w.output.textContent,/GPU check unavailable/);
    assert.equal(w.button.disabled,false);
  });
  console.log('\nHARDWARE UI: ' + passed + '/' + total + ' checks passed');
  if (passed!==total) process.exit(1);
})().catch(e=>{console.error(e);process.exit(1);});
