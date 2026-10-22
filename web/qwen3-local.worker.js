// Experimental Qwen3-TTS 1.7B CustomVoice local worker.
// Speaker and acting are independent per-sentence settings.
// Only Read-Aloud's same-origin Go proxy can reach the fixed 127.0.0.1 native server.
// No native flags, cloned voice paths, model selection or watermark opt-outs.
// The existing CosyVoice and Sherpa workers are unchanged.
'use strict';

let initialized = false;
let inFlight = false;
let apiToken = '';
const presetVoices = new Set([
  'aiden','dylan','eric','ono_anna','ryan','serena','sohee','uncle_fu','vivian'
]);

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
    throw new Error('Expected 24 kHz mono 16-bit PCM WAV from Qwen3-TTS.');
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
      if (!/^[0-9a-f]{48}$/.test(apiToken)) {
        throw new Error('Open Read-Aloud using its local launcher.');
      }
      if (msg.nativeVoice !== 'vivian') {
        throw new Error('Only the tested Vivian startup preset is enabled in this first Qwen test.');
      }
      const res = await fetch('/api/tts/qwen/status', {cache:'no-store'});
      if (!res.ok) throw new Error('The launcher does not support local Qwen yet.');
      const status = await res.json();
      if (status.state !== 'ready') throw new Error(status.message || 'Start Qwen CustomVoice and try again.');
      initialized = true;
      self.postMessage({type:'tts-ready',numSpeakers:1});
    } catch (err) {
      self.postMessage({type:'tts-error',message:String(err?.message || err)});
    }
    return;
  }
  if (msg.type !== 'generate') return;
  const id = msg.id;
  if (!initialized) {
    self.postMessage({type:'tts-error',id,message:'Qwen is not connected; select a working voice.'});
    return;
  }
  if (inFlight) {
    self.postMessage({type:'tts-error',id,message:'The Qwen speech engine is busy.'});
    return;
  }
  inFlight = true;
  try {
    const speaker = String(msg.speaker || 'vivian');
    const acting = String(msg.acting || '');
    if (!presetVoices.has(speaker)) throw new Error('Unknown Qwen speaker in the script: '+speaker);
    if (acting.length > 300 || /[\x00-\x1f\x7f]/.test(acting)) {
      throw new Error('The acting direction is invalid.');
    }
    const body = {
      input:String(msg.text || ''),
      speed:Number(msg.speed)
    };
    // Omit the voice field for Vivian to use the proven --voice vivian server
    // startup. Other preset speakers are selected per request and tested
    // independently; failures must be shown rather than silently using Vivian.
    if (speaker !== 'vivian') body.voice = speaker;
    if (acting) body.acting = acting;
    const res = await fetch('/api/tts/qwen/speech', {
      method:'POST',
      credentials:'same-origin',
      headers:{'Content-Type':'application/json','X-RA-Token':apiToken},
      body:JSON.stringify(body)
    });
    if (!res.ok) {
      let reason = 'Local Qwen failed (' + res.status + ').';
      try {
        const reply = await res.json();
        if (reply && typeof reply.error === 'string') reason = reply.error;
      } catch (_) { /* preserve the HTTP status */ }
      throw new Error(reason);
    }
    const audio = decodeMonoPCM16Wav(await res.arrayBuffer());
    self.postMessage({type:'tts-result',id,samples:audio.samples,sampleRate:audio.sampleRate},
      [audio.samples.buffer]);
  } catch (err) {
    self.postMessage({type:'tts-error',id,message:String(err?.message || err)});
  } finally {
    inFlight = false;
  }
};
