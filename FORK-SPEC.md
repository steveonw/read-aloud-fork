# Read-Aloud Studio — Fork Specification v0.1

**Status:** proposed implementation plan; no fork application code implemented  
**Prepared:** 2026-10-17  
**Target repository:** https://github.com/steveonw/read-aloud-fork  
**Upstream foundation:** https://github.com/steveonw/Read-Aloud-Main  
**Optional movie consumer:** https://github.com/steveonw/movie-skill-for-ai  
**First constrained hardware test:** NVIDIA GTX 1650, 4 GB VRAM; host OS and system RAM must be confirmed during implementation.

> **Project purpose.** Keep Read-Aloud's excellent proofreading and sentence playback workflow, while adding a native CosyVoice 3 narration backend, paragraph-level creative direction, selective sentence retakes, reliable saved projects, and an export usable by the movie-making pipeline. Preserve USB portability where feasible. The app remains useful on a machine that cannot run CosyVoice.

## 1. Starting point and decisions

As inspected on 2026-10-17, the new target repository contains **LICENSE only** (MIT, matching upstream); there is no imported Read-Aloud source, build, or fork-specific README yet. This is a separate new GitHub repository, not an assertion that upstream history or code has already been copied.

**Architecture decision:** create a lean fork **from existing Read-Aloud code**, rather than rewriting the editor, playback, sentence splitter, Go launcher, or WASM engine. Keep the upstream application unchanged.

**Default recording decision:** sentences are the individually editable and cached recording units. Paragraph instructions are inherited as context for each sentence. Continuous full-paragraph takes and punch-in editing are advanced optional modes, not prerequisites for v1.

**Portability decision:** the core USB app and lightweight offline voices work without CUDA or Python. CosyVoice is an optional platform-specific local backend, or a separately configured remote service.

**No automatic GPU promises:** a 0.5B model's approximately 1 GB FP16 language-model weights are **not** the full end-to-end memory budget. Model weights, flow/vocoder components, temporary allocations and CUDA runtime must be measured on the complete pipeline. No unconditional “4 GB works” or fixed “8 GB required” statement.

## 2. Product goals and non-goals

### Goals (required)

1. Retain the original **F8 read from cursor/selection, F7 replay, F9/F10 flags, sentence highlighting, step/focus modes, writing checks, pronunciation dictionary, and adjustable pauses**. Preserve the original keyboard-first proofreading experience for both humans and AI-assisted workflows.
2. Native **CosyVoice 3 0.5B** as the primary expressive TTS integration, not a converted Sherpa/Kokoro voice package. Use the supported native CosyVoice API and voice reference/instruction mechanisms; never claim an instruction will be obeyed perfectly.
3. A user can set **paragraph delivery** (voice/reference, emotion, acting instruction, pacing and pauses), then record, play, accept, reject, or retake a single sentence without losing other accepted takes.
4. One machine can proofread without a GPU; another can render with local CUDA; a third can optionally connect to an authenticated external TTS service.
5. Persist a project and all accepted/previous takes **on disk**; reopening the project cannot force regeneration of unchanged accepted audio.
6. Export master narration WAV and machine-readable measured timing sidecar; provide optional MP3, captions, and Audacity labels without inventing word-internal timestamps.
7. Allow deterministic programmatic operations for an authorized local AI, while humans get equivalent visible controls.
8. Preserve portable project paths and the original USB packaging as a supported core edition.

### Not in v1

- Training or finetuning CosyVoice; promising real-time synthesis on a GTX 1650; automatic remote cloud upload; guaranteed portable CUDA across unrelated systems; fully automatic image generation or movie direction; arbitrary model-specific emotion controls; full digital-audio workstation; mandatory LLM/agent; four-agent coordination.
- Automatically generating word onset timestamps from sentence clip boundaries. Word-level alignment for exact video reveals is a distinct later capability.

## 3. Upstream pieces to keep and adapt

| Upstream location | Reuse | Fork change |
| --- | --- | --- |
| `web/app.js` | Editor, sentence segmentation, F8/F7 playback, flags, cached look-ahead, pronunciation, WASM audio assembly | Separate document IDs from audio takes; paragraph instructions; retake/select take; disk project APIs; external engine adapter |
| `web/sherpa-onnx-tts.worker.js` | Known-good offline CPU/WASM fallback | Keep as existing provider; **do not** bolt CosyVoice onto the Sherpa model-config branches |
| `cmd/launcher/main.go` | Loopback Go HTTP launcher, static serving, host/origin checks and mutation token | Add authorized project and TTS endpoints; supervise optional native worker; maintain localhost-only default |
| `cmd/launcher/voices.go` | Safe voice catalog and strict path validation | Add a separate **native backend** catalog; preserve validation of Piper/Kitten/Kokoro packages |
| `scripts/` and `.github/workflows/` | Existing cross-platform/USB build flow, regression tests | Keep core build independently functional; add optional platform-specific native packaging later |
| `movie-skill-for-ai/ARCHITECTURE.md` | Optional shared audio/timing output conventions | Export compatibility adapter; **do not** require movie Skills just to proofread or narrate |

Read-Aloud currently sends `{type:'generate', id, text, sid, speed}` and receives `{type:'sherpa-onnx-tts-result', id, samples, sampleRate}`. Preserve this contract at the **browser adapter boundary**, including the ID used to associate results with the correct sentence. The native adapter may use HTTP/WAV internally, but the existing playback pipeline should not need to distinguish sources.

**Regression guarantee:** importing upstream must be the first independent change; run its Go, JavaScript, stress and browser tests before rewriting behavior. Record the exact upstream commit SHA.

## 4. Proposed architecture

~~~text
                                 READ-ALOUD STUDIO
                         shared browser UI + proofreader
                           |                    |
                   local JS engine         backend adapter
                    (existing)                 |
                      WASM            Go loopback launcher
                 Piper/Kitten/Kokoro           |
                                       compatibility / job gate
                                              |
                               +--------------+---------------+
                               |                              |
                       Local native worker             Configured remote
                       Python / CosyVoice 3            TTS worker/server
                       NVIDIA GPU if ready             authenticated + TLS
                               |                              |
                               +---------- audio WAV ----------+
                                              |
                              same Float32 samples + sampleRate
                                              |
                    playback + take selection + disk cache + export
                                              |
                                narration.wav / narration.json
                                              |
                             optional movie-skill-for-ai import
~~~

- **Default:** single-user loopback app, no network service discovery, no remote transmit, no cloud account.
- **Model loading:** lazy and conditional: open the editor and use the fallback without launching Python. Starting CosyVoice can be expensive and must show useful progress/errors.
- **Concurrency:** limit the native GPU process to one inference job initially. One synthesis at a time is well suited to a 4 GB GPU, and avoids VRAM peaks from batching.
- **Engine switching:** never destroy existing takes; retain metadata and mark which engine made each take.
- **Process lifecycle:** launcher can start/stop the local subprocess, expose readiness and safe log tails, and detect crashes. App stays alive and usable when subprocess exits or OOMs.

## 5. GPU hardware gate

The gate is a **capability check for each backend**, not an app-wide startup restriction.

| State | Meaning | Behavior |
| --- | --- | --- |
| **READY** | Dependencies and device supported; free-memory headroom meets *measured* profile | Engine selectable normally |
| **WARNING** | Unknown measured peak, memory headroom tight, or experimental hardware | Explain risk and allow **Try anyway** |
| **UNAVAILABLE** | No compatible runtime/device, missing model, unsupported operator, or verified hard incompatibility | Disable only that backend; preserve editing and CPU voices |
| **ERROR** | A previous engine job failed or ran out of memory | Show recovery steps; unload or restart worker; keep saved audio and draft |

**Preflight inputs:** platform, CPU architecture, installed backend runtime, available driver/CUDA, GPU identity and compute capability, total and *currently free* VRAM, model/version, dtype, quantization if truly supported, optional system-RAM headroom, and measured safe peak from prior runs. NVIDIA NVML/`nvidia-smi` and PyTorch may be used where available; their absence is a diagnostic, not a fatal app error.

**Do not derive peak VRAM solely from 0.5B parameter count.** Perform a real warmup and short-sentence pilot; record peak allocated/reserved GPU bytes and process/device VRAM readings, including flow and vocoder. Use configurable safety headroom. A gate should reassess free VRAM when a job starts, because other programs may have used memory since startup.

**GTX 1650 pilot:** specifically test an NVIDIA 1650 4 GB with current compatible CUDA/PyTorch, first with native documented FP16/mixed precision. Investigate careful component placement, shorter input, or INT8 **only if** there is a verified runtime that actually supports it. TensorRT-LLM quantization flags are not proof of a GTX 1650-ready entire CosyVoice 3 pipeline. Benchmark wall time and resulting acting quality as well as memory.

**OOM behavior:** the failed request gets its own structured error; pending/accepted takes and editor contents remain intact; no partial WAV is marked accepted; restart and switch backend are available. Never quietly substitute an inferior voice in an accepted take.

### Example diagnostics (illustrative, not measured)

~~~json
{
  "backend": "cosyvoice3-local",
  "state": "warning",
  "device": "NVIDIA GeForce GTX 1650",
  "vram_total_bytes": 4294967296,
  "vram_free_bytes": null,
  "measured_peak_bytes": null,
  "reasons": ["memory_profile_not_verified"],
  "can_try": true
}
~~~

Backend status must be honest about missing data.

## 6. Speech backend interface

Expose a stable internal backend abstraction, with a native CosyVoice provider first and the original WASM provider preserved. Suggested operations:

- `discover()` — installed backends/voices and documented capabilities.
- `preflight(backend, model)` — READY / WARNING / UNAVAILABLE with reason codes.
- `submit(job)` — text or paragraph unit, speaker/reference, actual supported delivery instruction, speed, seed if supported, request ID, source/provenance IDs.
- `status(job_id)` — queued/running/ready/failed, errors and progress.
- `audio(job_id)` — return finished PCM WAV and verified sample rate/length.
- `cancel(job_id)` — best-effort cancellation; make it explicit if an active GPU call cannot be interrupted immediately.
- `unload()` — free model/process memory.

Start with **Go same-origin API routes** such as `GET /api/tts/backends`, `POST /api/tts/jobs`, `GET /api/tts/jobs/{id}`, `GET /api/tts/jobs/{id}/audio`, and `DELETE /api/tts/jobs/{id}`. The Go launcher proxies to a private native process or manages a subprocess queue. Implement result-to-request ID matching at every boundary. HTTP routes are proposals until implemented and tested.

**Security:** mutations require existing Read-Aloud same-origin/run-token protections; reject unauthorized requests, cross-origin requests, oversize text/audio, arbitrary shell arguments, and paths outside the project/model roots. Local backend binds only to loopback. Remote mode is opt-in and separately authenticated with TLS or a trusted VPN; do not store remote API keys in the public repo, export, or browser logs. Private scripts must not be transmitted without explicit configuration.

**Native CosyVoice:** map voice reference and supported directions to official zero-shot / `inference_instruct2` entry points, with correct prompt-format handling. Confirm output language, reference rights/voice licenses, sample rate and error behavior in real tests. Keep backend-specific detail out of the common UI. No hardwired universal emotion enum: freeform instructions may fail and must be auditioned.

## 7. Document, paragraph and sentence model

A **paragraph** owns the default delivery profile; a **sentence** owns text and stable identity; a **take** owns one immutable audio recording.

- Preserve exact original/display text separate from normalized spoken text and pronunciation replacements.
- Give paragraphs stable IDs `p001` and sentences stable IDs `s001` that survive unrelated edits/moves where possible. Detect insertions/deletions with tested ID reconciliation; don't depend solely on byte offsets.
- Paragraph direction fields: narrator/character, reference voice/clip, emotion or acting prose, style/pacing, optional before/after pauses. A sentence can override fields or explicitly inherit all defaults.
- Default synthesis is **one sentence at a time**, using the paragraph's delivery profile. This is not equal to having full continuous paragraph acoustic context; do not overstate its continuity.
- Each sentence can hold multiple takes. One `active_take_id` is accepted for playback/export. “Retake” **always generates a new candidate**, even with identical text/instructions; never merely returns an old content-hash cache hit.
- Rejected takes remain recoverable until explicitly deleted; a failed candidate never overwrites the active accepted take.
- An edit to source text or relevant delivery makes earlier takes **stale for the new instruction**, without deleting their audio. A user may compare them, but exports require all active takes to match current text/profile or an explicitly recorded override and warning.
- Changing one sentence requires re-synthesis only of that sentence. Changing a paragraph instruction marks affected sentence performances stale, but does not silently discard accepted audio.

### Example project file (illustrative)

~~~json
{
  "schema": "readaloud-studio/project@0.1",
  "script_file": "script.md",
  "paragraphs": [
    {
      "id": "p001",
      "direction": {
        "voice_profile": "narrator-a",
        "acting": "Serious documentary narrator, restrained disbelief"
      },
      "sentences": [
        {
          "id": "s001",
          "display_text": "Each frame took fourteen hours.",
          "spoken_text": "Each frame took fourteen hours.",
          "active_take_id": "t001"
        }
      ]
    }
  ],
  "takes": [
    {
      "id": "t001",
      "sentence_id": "s001",
      "file": "audio/t001.wav",
      "engine": "cosyvoice3",
      "profile_id": "narrator-a",
      "input_hash": "sha256-example-not-real",
      "sample_rate": 24000,
      "sample_count": 72000,
      "state": "accepted"
    }
  ]
}
~~~

Real take metadata should also record engine/model revision and precision, voice/reference fingerprint, prompt/delivery hash, generation seed when applicable, created time, sample format, speech bounds when measured, and observed warnings. Cache lookup must include all synthesis-affecting inputs and model version; the durable *take ID* must remain separate from the cache key.

## 8. Two narration workflows

### A. Proofreading / rapid drafting

- Paste or load a `.txt`/`.md` story; F8 reads from selection/cursor and highlights the corresponding sentence.
- Use lightweight WASM voices by default; enable CosyVoice for higher-quality preview where resources allow.
- F7 replays the selected sentence; F9/F10 flag problems; revise text without losing all other narration.
- Editing a word invalidates only the relevant current spoken text. Save and reopen the project on the same USB drive.

### B. Production narration / retakes

1. Human or authorized AI supplies prose and optional paragraph directions.
2. Select a voice/reference clip and local or remote provider.
3. Produce candidate **per-sentence** WAVs; audition and accept the individual takes.
4. “Retake sentence” creates a new candidate using the inherited paragraph instruction, optionally with a sentence override.
5. Assemble only **accepted current takes** into one master WAV with explicit sentence/paragraph pauses and deterministic sample counts.
6. Export script, audio, timing and per-take provenance; Movie Builder can time images against the measured audio.

### Advanced, later: continuous paragraph with punch-in

Allow a whole-paragraph TTS take, align its sentence boundaries, and retain the original uncut take. Support replacement of one sentence using the same profile/reference, cutting at suitable pauses, with a short non-destructive crossfade or loudness match if audible seams are detected. If replacement sounds unnatural, offer a neighboring two-sentence or whole-paragraph retake. This is **not** v1's default or quality guarantee.

## 9. Portable project and packaged editions

~~~text
ReadAloudStudio/
  START - WINDOWS.exe / START - LINUX.sh / START - MACOS.app
  shared/                 # existing offline HTML, JS, CSS, WASM
  voices/                 # existing Piper, Kokoro, Kitten voices
  backends/
    cosyvoice/            # OPTIONAL platform-specific runtime/config
  models/
    cosyvoice3/           # OPTIONAL model files; licensing checked
  projects/
    my-story/
      project.json
      script.md
      audio/              # immutable, per-take WAV clips
      references/         # optional user-approved voice references
      exports/
        narration.wav
        narration.json
        narration-labels.txt
      reports/
  LICENSES/
~~~

- **Core edition:** compact USB-ready app, lightweight voices, no Python/CUDA requirement; should remain usable completely offline and on existing supported operating systems.
- **Native edition:** optionally includes a suitable runtime and model files, platform by platform. Do not promise a single universal portable CUDA environment: host GPUs, drivers and native library dependencies are external constraints.
- **Remote edition:** core app plus explicit authenticated backend URL; check server hardware and model rather than demanding a GPU in the client device.
- Use relative project paths, atomic writes, checksums, safe filenames, and backup/repair messages. No private stories or audio enter public GitHub by default.
- Preserve original MIT attribution and notices; audit **CosyVoice code, model weights, reference voices, bundled redistributables, FFmpeg/audio libraries** and each voice package's actual license before redistribution.

## 10. Film / AI interoperability

Read-Aloud Studio remains independently useful. It is the **audio producer**, not a competing Story Director or full movie editor.

Export at least `narration.wav` plus a machine-readable `narration.json` containing sample rate, total sample count, paragraph and stable sentence IDs, actual start/end sample indices, inserted pause intervals, original/spoken text map, active take ID, and model provenance. Optional `narration.srt` and Audacity labels may be produced.

Align with the **provisional** `filmkit/narration@1.0` conventions in https://github.com/steveonw/movie-skill-for-ai/blob/main/ARCHITECTURE.md without claiming that contract is frozen. Store *audio boundaries* precisely; label exact **word** timestamps “unavailable” unless a validated aligner produced them. Reveals inside “fourteen” or “Bang” require measured word timing and conservative frame rounding.

Human UI and authorized AI/CLI should share the **same operations**: inspect project, set paragraph direction, generate one sentence, list/accept takes, export. The AI should not need to drive a mouse or use a second TTS implementation. Avoid exposing a network-accessible unauthenticated production endpoint.

## 11. Implementation sequence and acceptance gates

### M0 — Import upstream baseline (first PR; no redesign)
- Import source, tests, license notices and builder from `Read-Aloud-Main` into the fork. Record exact upstream SHA and license.
- Run documented Go tests and JavaScript tests; make a smoke build and F8/WAV test.
- Acceptance: original functionality behaves the same; Git history/source attribution documented; core USB build still works.

### M1 — Provider abstraction with a fake/native stub
- Keep WASM worker functional; add backend selection and a same-origin native adapter that emits the same request IDs and PCM+sample-rate result shape.
- Exercise delayed, cancelled, repeated and failed calls without misassigning audio to a sentence.
- Acceptance: F8, F7, flags, replay, export all still work with WASM; mock native backend returns playable audio with correct highlight.

### M2 — CosyVoice 3 + honest hardware gate
- Implement native worker, supported voice reference/instruction options, compatibility states and clean subprocess lifecycle.
- Run GTX 1650 4 GB smoke pilot, record observed peak VRAM, generation time and actual audible output. Test machine with no CUDA too.
- Acceptance: if compatible, selected sentence synthesizes and plays; if not, clear warning/error and fallback; app never crashes or loses the draft/takes. A 4 GB pass is **unknown until tested**, not assumed.

### M3 — Paragraph directions, take history and persistent projects
- Add delivery profiles and per-sentence overrides; allow rerender of one selected sentence even when wording is unchanged; accept/reject/restore takes; safe persistent audio.
- Acceptance: for a 20-sentence project, retaking sentence 7 produces exactly one new candidate, unchanged 19 active audio blobs remain byte-identical, and reopening from USB restores all selections.

### M4 — Export and movie handoff
- Deterministic sample-based audio assembly with pause events; create WAV, timing JSON and optional MP3/labels/SRT.
- Acceptance: exported WAV sample count equals sidecar totals; changing one accepted take rebuilds output without re-synthesizing 19 others; segment IDs and bounds survive script reordering where valid.

### M5 — Packaging, remote option and security
- Verify core USB fallback on supported hosts; package native provider separately for target OS; add secure remote provider option.
- Acceptance: app launches without Python/GPU; GPU backend is selectable only when available; no unauthorized API mutation or accidental network upload; remote server sees only explicitly submitted text.

### M6 — Optional paragraph performance and advanced punch-in
- Continuous paragraph takes; validated sentence alignment; edit one sentence within paragraph; audition seams, restore source take, adjust neighborhood when necessary.
- Acceptance: clear indication of alignment confidence; unchanged take regions not re-synthesized; no promised word timing without measurement.

## 12. Required test matrix

| Scenario | Required result |
| --- | --- |
| USB/core with no NVIDIA GPU or Python | Proofreading, offline voice, audio export work |
| GTX 1650 4 GB | Honest preflight; actual memory measurement; success or graceful bounded OOM |
| More powerful compatible NVIDIA device | Native CosyVoice can load and narrate a short sentence |
| Wrong driver, model absent, or corrupt model | CosyVoice unavailable; no application-wide failure |
| Local process crash during sentence 7 | Draft and previously accepted 1–6 survive; result never shifts to sentence 8 |
| Sentence-only edit or forced retake | Only selected sentence generates a new candidate; all other accepted takes remain |
| Paragraph instruction edit | Affected sentences flagged stale; old takes retained |
| USB removal or unwritable destination | Explicit write failure; project not silently marked saved |
| Reopen project on same/different host | Stable take IDs, relative paths, and verified audio; backend may be unavailable without losing files |
| Export then import into Movie Builder | Sample-derived durations preserved; no invented word timing; no premature reveal on measured anchor |
| Remote enabled/disabled | No connection when disabled; when enabled authentication and transport protections enforced |

Test with original `go test ./cmd/...`, `node scripts/web_tests.js`, `node scripts/stress_tests.js`, appropriate real-browser smoke tests, new native backend unit/integration tests, sample-level audio assertions, malformed-input and CSRF/path-traversal security tests, and clean-install packaging tests. Report what was actually run and on which OS/GPU, not just “tests pass”.

## 13. Proposed new source tree after M0

~~~text
web/
  app.js                      # evolved from Read-Aloud
  tts-adapter.js              # browser-level provider selection
  sherpa-onnx-tts.worker.js   # retained fallback
  native-tts.worker.js        # async native proxy, same playback result
cmd/launcher/
  main.go                     # existing launcher; new routes registered cleanly
  tts_routes.go               # auth, status, job proxy
  project_routes.go           # local project save/open and validation
native/cosyvoice/
  server.py                   # model lifecycle + one-job-at-a-time service
  probe.py                    # device/runtime/VRAM preflight
  engine.py                   # official CosyVoice inference adapter
  requirements-locked.*       # generated after working platform benchmark
contracts/
  project.schema.json
  narration.schema.json
tests/
  backend/                    # CPU/mock+GPU optional
  projects/
  exports/
docs/
  HARDWARE-RESULTS.md         # measured 1650 and other machine outcomes
  LICENSE-AUDIT.md
FORK-SPEC.md
~~~

The filenames are proposals. Avoid needless refactors in M0–M2: prefer minimal changes to stable upstream code until the native backend is genuinely tested.

## 14. Decisions still open

- The final product display name (“Read-Aloud Studio” is provisional).
- First native packaging target (Windows x64 versus Linux), host RAM, driver/CUDA stack, and specific compatible Torch/CosyVoice versions.
- Whether reference-audio storage is embedded in the project or linked to a licensed external library.
- Exact persistence schema migration/versioning and how aggressively IDs survive large rewrites.
- Whether remote servers are a post-v1 feature; if yes, which authentication mechanism and deployment guide.
- Which selective word-alignment engine is reliable enough for film reveal anchors.
- Whether measured CosyVoice 3 fits 4 GB on the test PC; what quantized or CPU-offloaded alternatives actually work.

**First actionable task:** open M0 as a small import PR and prove unmodified Read-Aloud builds, plays, exports, and passes tests in this new repo. **Do not gut the source tree first.**

---

**Reference pointers:**  
- Upstream Read-Aloud: https://github.com/steveonw/Read-Aloud-Main  
- Upstream work queue / app: https://github.com/steveonw/Read-Aloud-Main/blob/main/web/app.js  
- Existing Sherpa worker: https://github.com/steveonw/Read-Aloud-Main/blob/main/web/sherpa-onnx-tts.worker.js  
- Existing Go launcher: https://github.com/steveonw/Read-Aloud-Main/blob/main/cmd/launcher/main.go  
- Official CosyVoice code and examples: https://github.com/QwenAudio/CosyVoice  
- Proposed filmkit conventions: https://github.com/steveonw/movie-skill-for-ai/blob/main/ARCHITECTURE.md
