// Read-Aloud Studio: transport-level speech backend adapter (M1).
// The original Sherpa worker remains the default. Optional native providers
// can register later without changing F8 playback, caching, or WAV export.
(function (root) {
  'use strict';

  const factories = Object.create(null);
  const DEFAULT_BACKEND = 'sherpa-wasm';
  const ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
  const RESULT_TYPES = Object.freeze({
    'tts-progress': 'sherpa-onnx-tts-progress',
    'tts-ready': 'sherpa-onnx-tts-ready',
    'tts-result': 'sherpa-onnx-tts-result',
    'tts-error': 'error',
  });

  // Existing Sherpa messages already match the app.js event contract.
  // New providers may send engine-neutral tts-* message types instead.
  function normalizeMessage(data) {
    if (!data || typeof data !== 'object') {
      return {type: 'error', message: 'Invalid speech backend reply'};
    }
    const type = Object.prototype.hasOwnProperty.call(RESULT_TYPES, data.type)
      ? RESULT_TYPES[data.type] : data.type;
    if (type === data.type) return data;
    return Object.assign({}, data, {type});
  }

  function registerBackend(id, makeWorker) {
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
      throw new TypeError('Invalid speech backend id');
    }
    if (typeof makeWorker !== 'function') {
      throw new TypeError('Speech backend factory must be a function');
    }
    if (Object.prototype.hasOwnProperty.call(factories, id)) {
      throw new Error('Speech backend is already registered: ' + id);
    }
    factories[id] = makeWorker;
  }

  function createVoiceWorker(voice, WorkerCtor) {
    const id = voice && voice.backend ? voice.backend : DEFAULT_BACKEND;
    const makeWorker = Object.prototype.hasOwnProperty.call(factories, id)
      ? factories[id] : null;
    if (!makeWorker) throw new Error('Speech backend is not available: ' + id);

    const NativeWorker = WorkerCtor || root.Worker;
    const raw = makeWorker(NativeWorker, voice);
    if (!raw || typeof raw.postMessage !== 'function' || typeof raw.terminate !== 'function') {
      throw new TypeError('Speech backend must expose postMessage() and terminate()');
    }

    let closed = false;
    const bridge = {
      backend: id,
      onmessage: null,
      onerror: null,
      postMessage(message, transfer) {
        if (closed) throw new Error('Speech backend has been terminated');
        if (transfer === undefined) raw.postMessage(message);
        else raw.postMessage(message, transfer);
      },
      terminate() {
        if (closed) return;
        closed = true;
        raw.onmessage = null;
        raw.onerror = null;
        raw.terminate();
      },
    };

    raw.onmessage = (event) => {
      if (!closed && typeof bridge.onmessage === 'function') {
        bridge.onmessage({data: normalizeMessage(event && event.data)});
      }
    };
    raw.onerror = (event) => {
      if (!closed && typeof bridge.onerror === 'function') bridge.onerror(event);
    };
    return bridge;
  }

  registerBackend(DEFAULT_BACKEND, (WorkerCtor) => {
    if (typeof WorkerCtor !== 'function') throw new Error('Web Worker support is unavailable');
    return new WorkerCtor('sherpa-onnx-tts.worker.js', {type: 'module'});
  });

  // Optional native GGUF backend: only selected after the local server is
  // discovered and the user acknowledges voice rights. The existing WASM
  // transport remains the default and runs even without CrispASR installed.
  registerBackend('cosyvoice3-local', (WorkerCtor) => {
    if (typeof WorkerCtor !== 'function') throw new Error('Web Worker support is unavailable');
    return new WorkerCtor('cosyvoice-local.worker.js', {type:'module'});
  });

  // Qwen CustomVoice GGUF: independent speaker and acting per sentence.
  // No model is downloaded by this browser adapter.
  registerBackend('qwen3-local', (WorkerCtor) => {
    if (typeof WorkerCtor !== 'function') throw new Error('Web Worker support is unavailable');
    return new WorkerCtor('qwen3-local.worker.js', {type:'module'});
  });

  root.ReadAloudTTS = Object.freeze({
    createVoiceWorker,
    normalizeMessage,
    registerBackend,
    listBackends: () => Object.keys(factories),
    DEFAULT_BACKEND,
  });
})(typeof window !== 'undefined' ? window : globalThis);
