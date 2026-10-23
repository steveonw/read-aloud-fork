// M4b: attach ordinary AI-generated metadata to locally reassembled CosyVoice
// WAV/MP3 exports. NOT a signed C2PA manifest. Native watermark remains ON.
// Publication still needs a visible AI-generated narration disclosure.
(function (root) {
  'use strict';

  function ascii(text) {
    const out = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code > 127) throw new Error('Non-ASCII AI provenance value');
      out[i] = code;
    }
    return out;
  }

  function infoSubchunk(id, text) {
    const data = ascii(text + '\0');
    const out = new Uint8Array(8 + data.length + (data.length & 1));
    out.set(ascii(id));
    new DataView(out.buffer).setUint32(4, data.length, true);
    out.set(data, 8);
    return out;
  }

  function markWav(buffer) {
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 44 ||
        String.fromCharCode(...new Uint8Array(buffer, 0, 4)) !== 'RIFF' ||
        String.fromCharCode(...new Uint8Array(buffer, 8, 4)) !== 'WAVE') {
      throw new Error('Expected a generated RIFF WAV');
    }
    const src = new DataView(buffer);
    if (src.getUint32(4, true) + 8 !== buffer.byteLength) {
      throw new Error('Unexpected WAV size');
    }
    const entries = [
      infoSubchunk('ISFT', 'Read-Aloud / CosyVoice 3 GGUF'),
      infoSubchunk('ICMT', 'AI_GENERATED=true; GENERATOR=Read-Aloud/CosyVoice3; DISCLOSURE=AI-generated narration, disclose in the published project.')
    ];
    const contentLength = 4 + entries.reduce((n, entry) => n + entry.length, 0);
    const size = buffer.byteLength + 8 + contentLength + (contentLength & 1);
    if (size > 0xffffffff) throw new Error('WAV too large');
    const out = new Uint8Array(size);
    out.set(new Uint8Array(buffer));
    const dv = new DataView(out.buffer);
    dv.setUint32(4, size - 8, true);
    let at = buffer.byteLength;
    out.set(ascii('LIST'), at);
    dv.setUint32(at + 4, contentLength, true);
    out.set(ascii('INFO'), at + 8);
    at += 12;
    for (const entry of entries) {
      out.set(entry, at);
      at += entry.length;
    }
    return out.buffer;
  }

  function textFrame(description, value) {
    // ID3v2.3 TXXX: text encoding 0 = Latin-1 (fields below are ASCII).
    const label = ascii(description);
    const val = ascii(value);
    const payload = new Uint8Array(1 + label.length + 1 + val.length);
    payload.set(label, 1);
    payload.set(val, label.length + 2);
    const frame = new Uint8Array(10 + payload.length);
    frame.set(ascii('TXXX'));
    new DataView(frame.buffer).setUint32(4, payload.length, false);
    frame.set(payload, 10);
    return frame;
  }

  function markMp3(chunks) {
    if (!Array.isArray(chunks) || !chunks.length) throw new Error('Missing encoded MP3 data');
    const frames = [
      textFrame('AI_GENERATED', 'true'),
      textFrame('GENERATOR', 'Read-Aloud / CosyVoice 3 GGUF'),
      textFrame('AI_DISCLOSURE', 'Disclose AI-generated narration in the published project')
    ];
    const size = frames.reduce((sum, frame) => sum + frame.length, 0);
    if (size >= (1 << 28)) throw new Error('MP3 metadata too large');
    const tag = new Uint8Array(10 + size);
    tag.set(ascii('ID3'));
    tag[3] = 3; // ID3v2.3
    tag[6] = (size >>> 21) & 0x7f;
    tag[7] = (size >>> 14) & 0x7f;
    tag[8] = (size >>> 7) & 0x7f;
    tag[9] = size & 0x7f;
    let at = 10;
    for (const frame of frames) {
      tag.set(frame, at);
      at += frame.length;
    }
    return [tag, ...chunks];
  }

  const api = Object.freeze({markWav, markMp3});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ReadAloudProvenance = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : {}));
