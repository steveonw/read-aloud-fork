# M1: Speech backend adapter

**Status:** first backend abstraction PR; **CosyVoice is not implemented or bundled yet**.  
**Based on:** merged M0 (original Read-Aloud proofreading, Sherpa WASM and USB build).  
**Target hardware later (M2):** Windows, NVIDIA GTX 1650 4 GB VRAM, 20 GB system RAM.

## Why a small adapter first?

The original Read-Aloud queues one request at a time, uses a request ID to match audio back to the correct sentence, caches audio by normalized text, and gives the proofreader F8 playback, highlighting and exports.

Changing that pipeline while integrating CUDA would make regressions difficult to diagnose. M1 introduces a single pluggable worker **transport interface**, retaining the original Sherpa voice worker exactly as the default. M1 makes no changes to the model, text segmentation, native Go API, project file format or user controls.

## New files and changes

- `web/tts-backends.js`: registry, default Sherpa-WASM worker, worker lifecycle bridge and normalized event types.
- `web/index.html`: loads the adapter **before** the existing `app.js`.
- `web/app.js`: calls `ReadAloudTTS.createVoiceWorker(voice, Worker)` inside the existing `startVoice()`; shows a clean backend-unavailable status if the provider is not installed.
- `scripts/build_wasm.sh`: copies the new adapter into the generated `shared/` USB payload.
- `scripts/web_tests.js` and `scripts/stress_tests.js`: evaluate the adapter in the JS test harness so the regular 214 + 12 tests exercise the new path, not an alternate mock-only implementation.
- `scripts/tts_backend_tests.js`: separately tests 12 backend contract cases, including mock native messages.
- `scripts/smoke_test.js`: validates that the bundled adapter exists and parses.
- CI: short tests plus full Emscripten USB/Chromium regression on the M1 branch.

## Adapter contract

One backend factory must produce an object with at least `postMessage(message[, transfer])` and `terminate()` methods, and supports `onmessage` and `onerror` callbacks. `createVoiceWorker` returns an object with that same minimal interface. Explicit `voice.backend` selects a registered engine; an omitted backend selects `sherpa-wasm`. Unknown engines **raise a clear error** instead of silently switching to another voice.

Existing messages pass through byte-for-byte:

```js
{type:'init', modelUrl:'...', tokensUrl:'...', voiceId:'...'}
{type:'generate', id:42, text:'The first frame took fourteen hours.', sid:0, speed:1}
{type:'sherpa-onnx-tts-result', id:42, samples:Float32Array, sampleRate:22050}
```

Future native workers may respond using engine-neutral messages, which are converted at the adapter boundary:

| New message | Existing app message |
| --- | --- |
| `tts-progress` | `sherpa-onnx-tts-progress` |
| `tts-ready` | `sherpa-onnx-tts-ready` |
| `tts-result` | `sherpa-onnx-tts-result` |
| `tts-error` | `error` |

Each result/error retains its **original request ID**, sample buffer and sampling rate. The adapter does not reorder or misassign results; the unchanged existing `app.js` queue is responsible for matching IDs, avoiding duplicate synthesis and ignoring stale responses. Terminated workers stop delivering messages to the app.

## Safety and resource behavior

The current backend only creates the existing offline, local WASM worker. **No Python, GPU probing, network APIs, remote hosts, TTS server or automatic upload** are introduced in M1. The adapter's registration is browser-side, to allow an explicitly packaged local native provider in M2; it is not a security boundary by itself. Do not expose an unauthenticated remote worker or allow arbitrary script/URL selection in the UI.

**Not yet in M1:** persistent takes, paragraph acting instructions, a CosyVoice voice package, a GPU VRAM gate, or a native server. These are M2/M3 as stated in `FORK-SPEC.md`.

## Acceptance and rollout

1. `node scripts/tts_backend_tests.js .` passes 12/12.
2. Existing `node scripts/web_tests.js . 17391` passes 214/214 using the new adapter.
3. Existing `node scripts/stress_tests.js .` passes 12/12 using the new adapter.
4. Go unit tests and `go vet` pass unchanged.
5. Full USB build and real-browser runtime smoke passes; `tts-backends.js` is actually present in the zipped `shared/` folder.
6. No regression of F8 cursor proofreading, voice-switching, highlights, WAV/MP3 exports and drive-loss behavior.
7. A mock-native worker can supply a `tts-result` containing the correct request ID and audio samples; no fake promise of actual CosyVoice synthesis.

## M2 follow-up

Expose a **validated provider/voice catalog** from Go, add a private local native-worker bridge, apply the hardware gate before loading CosyVoice 3, then benchmark the GTX 1650's real VRAM/CPU RAM. An optional remote backend must require configuration, authentication and secure transport. Preserve the WASM provider when the native runtime is not installed or is incompatible.
