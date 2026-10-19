// M4: experimental native CosyVoice3 GGUF worker. Python is NOT required.
// Browser -> same-origin Go launcher -> fixed 127.0.0.1:18080 CrispASR server.
// No arbitrary URLs, direct cross-origin connections, model downloads or
// automatic disclosure opt-outs. The default WASM worker is unaffected.
'use strict';

let initialized = false;
let inFlight = false;
let apiToken = '';
let consentAttestation = '';
let chosenVoice = 'fleurs-en';

function decodeMonoPCM16Wav(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 44 || buffer.byteLength > (16 << 20)) {
    throw new Error('The local engine returned an invalid WAV size.');
  }
  const v = new DataView(buffer);
  const text = (at, n) => String.fromCharCode(...new Uint8Array(buffer, at, n));
  if (text(0, 4) !== 'RIFF' || text(8, 4) !== 'WAVE') {
    throw new Error('The local engine did not return RIFF WAV.');
  }
  if (v.getUint32(4, true) + 8 > buffer.byteLength) {
    throw new Error('The WAV has an invalid RIFF length.');
  }
  let channels = 0, rate = 0, bits = 0, format = 0;
  let dataAt = -1, dataBytes = 0;
  for (let at = 12; at + 8 <= buffer.byteLength;) {
    const id = text(at, 4);
    const n = v.getUint32(at + 4, true);
    const begin = at + 8;
    if (begin + n > buffer.byteLength) throw new Error('The WAV contains a truncated chunk.');
    if (id === 'fmt ') {
      if (n < 16) throw new Error('The WAV format block is incomplete.');
      format = v.getUint16(begin, true);
      channels = v.getUint16(begin + 2, true);
      rate = v.getUint32(begin + 4, true);
      bits = v.getUint16(begin + 14, true);
    }
    if (id === 'data') { dataAt = begin; dataBytes = n; }
    at = begin + n + (n & 1);
  }
  if (format !== 1 || channels !== 1 || bits !== 16 || rate !== 24000) {
    throw new Error('Expected 24 kHz mono 16-bit PCM WAV from CosyVoice.');
  }
  if (dataAt < 0 || dataBytes < 480 || dataBytes % 2) {
    throw new Error('The local engine returned empty or malformed audio.');
  }
  const count = dataBytes / 2;
  const samples = new Float32Array(count);
  let lo = 1, hi = -1, energy = 0, nearClip = 0;
  for (let i = 0; i < count; i++) {
    const value = v.getInt16(dataAt + i * 2, true) / 32768;
    samples[i] = value;
    if (value < lo) lo = value;
    if (value > hi) hi = value;
    energy += value * value;
    if (Math.abs(value) >= 0.999) nearClip++;
  }
  if (hi - lo < 0.0001 || Math.sqrt(energy / count) < 0.00005 || nearClip > count * 0.02) {
    throw new Error('The local engine returned silent, constant, or severely clipped audio.');
  }
  return {samples, sampleRate: rate};
}

self.onmessage = async (event) => {
  const msg = event.data || {};
  if (msg.type === 'init') {
    try {
      if (initialized) return;
      apiToken = String(msg.apiToken || '');
      consentAttestation = String(msg.consentAttestation || '');
      chosenVoice = String(msg.nativeVoice || 'fleurs-en');
      if (!/^[0-9a-f]{48}$/.test(apiToken)) throw new Error('Please reopen Read-Aloud through its local launcher.');
      if (chosenVoice !== 'fleurs-en' || consentAttestation !== 'I have the rights to use this voice') {
        throw new Error('Please confirm your rights to use the local CosyVoice voice first.');
      }
      const res = await fetch('/api/tts/cosyvoice/status', {cache:'no-store'});
      if (!res.ok) throw new Error('The Read-Aloud launcher did not answer the CosyVoice status check.');
      const status = await res.json();
      if (status.state !== 'ready') {
        throw new Error(status.message || 'Start the CosyVoice server and try again.');
      }
      initialized = true;
      self.postMessage({type:'tts-ready', numSpeakers:1});
    } catch (err) {
      self.postMessage({type:'tts-error', message:String((err && err.message) || err)});
    }
    return;
  }
  if (msg.type !== 'generate') return;
  const id = msg.id;
  if (!initialized) {
    self.postMessage({type:'tts-error',id,message:'CosyVoice is not connected. Select a working voice.'});
    return;
  }
  if (inFlight) {
    self.postMessage({type:'tts-error',id,message:'The native speech engine is busy.'});
    return;
  }
  inFlight = true;
  try {
    const res = await fetch('/api/tts/cosyvoice/speech', {
      method:'POST',
      credentials:'same-origin',
      headers:{'Content-Type':'application/json','X-RA-Token':apiToken},
      body:JSON.stringify({
        input:String(msg.text || ''),
        voice:chosenVoice,
        speed:Number(msg.speed),
        consentAttestation
      })
    });
    if (!res.ok) {
      let reason = 'Local CosyVoice failed (' + res.status + ').';
      try {
        const reply = await res.json();
        if (reply && typeof reply.error === 'string') reason = reply.error;
      } catch (_) { /* HTTP status is enough */ }
      throw new Error(reason);
    }
    const audio = decodeMonoPCM16Wav(await res.arrayBuffer());
    self.postMessage({type:'tts-result',id,samples:audio.samples,sampleRate:audio.sampleRate},
      [audio.samples.buffer]);
  } catch (err) {
    self.postMessage({type:'tts-error',id,message:String((err && err.message) || err)});
  } finally {
    inFlight = false;
  }
};

// Export only in a Node test context; no external dependencies.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {decodeMonoPCM16Wav};
}
