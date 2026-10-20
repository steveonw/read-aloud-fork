# Project handoff — M4 Read-Aloud + local CosyVoice 3 GGUF

**Start here for the current project goal and next session:** [HANDOFF_NEXT_SESSION.md](HANDOFF_NEXT_SESSION.md). This longer file is engineering history; older priorities below (e.g. acronym tests) may be superseded by the current handoff.

**Updated:** 2026-10-19 (US Eastern; GitHub work continued 2026-10-20 UTC)  
**Repository:** [steveonw/read-aloud-fork](https://github.com/steveonw/read-aloud-fork)  
**Current work:** [Issue #8](https://github.com/steveonw/read-aloud-fork/issues/8) / [DRAFT PR #9](https://github.com/steveonw/read-aloud-fork/pull/9) (`m4/local-cosyvoice-bridge`)  
**Resume point:** **Real M4c Windows acceptance test now PASSED for ordinary uppercase words:** the user's MP3 says `HEY!` as “Hey!” and `STOP RIGHT THERE!` as words, after **CrispASR-only** speech normalization (`HEY`→`Hey`, `FAFAFAFAD`→`Fafafafad`). The dotted acronym `F.B.I.` is still imperfect (“fee bee eye”), even though its label remains one sentence. The previous M4b one-session Narration Mode removed the repeated spoken AI announcement. Next *proposed* diagnostic: test `F B I` versus `eff bee eye`, without changing accepted case handling yet. Original Amy/Lessac, USB installation, GGUF models, native binary and `main` stay untouched; PR #9 remains draft. Integrity warning 5/37 still needs inspection.

This is the latest handoff. The [earlier M3 handoff](https://github.com/steveonw/read-aloud-fork/blob/m3/gguf-legacy-cuda/docs/HANDOFF_COSYVOICE_GGUF.md) records the complete legacy-CPU build and the successful standalone audio test.

## 0. Latest checkpoint — Read-Aloud/CosyVoice speech and MP3 SUCCESS (2026-10-19 evening US Eastern)

**This section overrides the earlier "native Read-Aloud TTS still untested" wording below.** The earlier port-17391 404 and "start the server" message were troubleshooting checkpoints, not the current blocker.

### M4b implementation — approved and committed after the successful MP3 test

The user subsequently authorized implementing the agreed approach ("ok do what you need to do"). The existing **draft PR #9** now contains optional **Narration mode**: user first confirms voice rights and explicitly accepts responsibility to disclose AI narration in the final project. The checkbox is **OFF by default**, remains local to the browser session, and is intentionally **not saved to settings or autosave**. It initializes the CosyVoice worker with a boolean; the Go bridge maps it to the upstream `spoken_disclaimer=false` and fixed `marking_attestation` values. Go refuses a "clean" speech response unless upstream confirms `X-Crispasr-Spoken-Disclaimer: skipped`. Sentence cache keys distinguish disclosed vs narration-mode lines, so the wrong takes cannot leak across mode switches.

The browser stitches native speech into new WAV/MP3 files, losing native signed C2PA chunks/headers. M4b labels the output with **plain** WAV LIST/INFO and MP3 ID3 AI-generated metadata; these exports **are not signed C2PA**. The audible disclaimer can be omitted only after affirmative project-level disclosure acceptance; the **inaudible watermark stays enabled** for the native engine, and the user must display an appropriate AI-generated-speech disclosure in the published work. This update **does not** add `--no-watermark`, `--no-c2pa`, new model downloads, background engine startup or full voice cloning.

**GitHub verification:** successful [M4 Windows test-kit build + Node/Go contract tests](https://github.com/steveonw/read-aloud-fork/actions/runs/39358205181) and successful [core regression](https://github.com/steveonw/read-aloud-fork/actions/runs/39358205111) on the first M4b implementation commit `b22d35e`. Follow-up MP3-mode metadata race fix is in progress. **This note is historical: the later M4b Windows MP3 did verify clean speech.** Leave PR #9 draft until that test and review.

### Optional native-server Start/Stop mini-program (2026-10-20 UTC)

A separate Windows Forms utility was added under [`tools/crispasr-server-control/`](../tools/crispasr-server-control/README.md), **without changing Read-Aloud, CrispASR, the GGUF weights, or the original USB copy**. It runs the user's existing `crispasr.exe` from `~/crispasr-gguf-legacy` with exactly the known-good `cosyvoice3-tts-rl`, `fleurs-en`, rights acknowledgment, and `127.0.0.1:18080` flags. It displays health, starts a minimized native console and remembers the PID, start timestamp, and executable path. **Stop is allowed only for that verified owned instance**, so a server started in Git Bash is reported as external and cannot be killed accidentally. Closing the UI leaves the managed engine running; reopening it permits stopping. This does **not** enable automatic startup within Read-Aloud and does not yet select Qwen engines.

[Windows CI build + offline configuration tests passed](https://github.com/steveonw/read-aloud-fork/actions/runs/39374421045). [Optional Windows EXE artifact](https://github.com/steveonw/read-aloud-fork/actions/runs/39374421045/artifacts/12243165572) (ZIP containing EXE, instructions, and complete source; temporary artifact). **Actual user-machine GUI startup/stop behavior remains to be confirmed.**

### Newest checkpoint — tested M4c uppercase handling on Windows

- User supplied **`read-aloud-narration(4).mp3` and `read-aloud-narration-labels(2).txt`** in the ChatGPT conversation, **not in GitHub**. Exact label spans: `0.00–0.76 HEY!`; `0.76–3.60 STOP RIGHT THERE!`; `3.60–6.16 F.B.I. is here.`.
- **Observed in audio:** `HEY!` is spoken as “Hey!”, not H E Y; `STOP RIGHT THERE!` is recognizable as ordinary words. This supports the simplified capitalization fix **for the phrases tested**. The example `FAFAFAFAD` has NOT been tested acoustically; nonsense may remain difficult to pronounce.
- **Unresolved:** `F.B.I.` sounds roughly “fee bee eye” instead of clearly “eff bee eye”. Although the periods remain intact and `F.B.I. is here.` stays one label/segment, the native model's acronym rendering is imperfect. Short silences/rough transitions between parts may also merit later investigation.
- **Exact implemented rule at `dc9e6d3`:** only `web/cosyvoice-local.worker.js` changes the *spoken request* text: `HEY!`→`Hey!`, `STOP RIGHT THERE!`→`Stop Right There!`, `FAFAFAFAD`→`Fafafafad`; `F.B.I.` stays `F.B.I.`. No acronym exception list; the editor, labels, highlighting, Go server and original Amy/Lessac workers are untouched.
- **Earlier M4b success:** a separate user MP3 spoke “The storm was coming. The road was empty.” without a repeated AI voice announcement. The user accepted session-only project-level AI disclosure; default spoken disclosure and native watermark remain supported; re-encoded WAV/MP3 contain ordinary AI metadata, NOT signed C2PA.
- **CI passed on the latest functional commit:** [M4 Windows Go/Node kit](https://github.com/steveonw/read-aloud-fork/actions/runs/39361970387) and [core regressions](https://github.com/steveonw/read-aloud-fork/actions/runs/39361970174). Automated tests used mocks; user's MP3 establishes narrow real speech acceptance.
- **Proposed next test, not implemented:** compare `F.B.I.`, `F B I`, and `eff bee eye` to determine a reliable spoken reading. Do not change code until there is an accepted direction; do not disturb the accepted ALL-CAPS normalization.

### Confirmed on the actual user machine

- Screenshot: local Read-Aloud test UI at `http://127.0.0.1:17391/` shows **"CosyVoice 3 GGUF — English is ready"**, with **"CosyVoice 3 GGUF — English (experimental)"** selected in Voice. The old 404/bridge-discovery blocker is no longer preventing selection. The precise cause of the earlier launcher mix-up was not conclusively established.
- User supplied an exported file named **`read-aloud-narration(2).mp3`**, containing multiple generated sentences narrated by the CosyVoice voice. The separate spoken line **"This audio was generated by artificial intelligence"** is audible before **every** sentence. This proves that the Read-Aloud → Go bridge → native server → speech audio/export flow has worked on the user's computer; it does **not** prove that exports are movie-ready or that all editing/replay/retake paths are correct.
- User supplied a corresponding Git Bash/CrispASR generation log. Repeated `[CONSENT]` records for `voice=fleurs-en` include **`spoken_disclaimer=yes`**; many `crispasr-server: synthesized ... format=wav ... sr=24000Hz` entries confirm real native per-sentence synthesis. The first sample shows 19.1 seconds of audio synthesized in 12.17 seconds (RTF 0.64); different lines vary with input length and GPU state.
- Native startup loads **8 voices** from the built-in GGUF voice bank, including `fleurs-en`, with **CUDA0** active and the legacy CPU-compatible build. The generic `--voice-dir not set` startup warning did **not** prevent this actual named-bank voice from synthesizing audio through Read-Aloud. Do **not** add an arbitrary voice directory or change the working startup command on the basis of that warning alone.
- Screen still shows **"Warning: 5 of 37 files on this drive failed their integrity check"** while the voice reports ready. A stale `SHA256SUMS.txt` from the original USB bundle is the *leading explanation*, because the M4 kit replaces five `shared/` files without regenerating the original manifest. **Not yet verified**: the names/hashes of the five failed files. Do not delete the checksum manifest, ignore unexpected DLL changes, or alter the original working USB copy.

### Historical issue — repeated spoken AI disclaimer (resolved in M4b)

Initial M4a requested sentences with the native default spoken AI disclaimer, once per line, disrupting continuous narration. **M4b now has an opt-in session-only project-disclosure mode**, confirmed by a real two-sentence MP3 without that announcement. The Go bridge checks upstream attestation and the native waveform watermark stays on. Finished WAV/MP3 metadata is unsigned; finished films still need an appropriate AI-generated-speech disclosure. This is no longer the active blocking problem. Current minor problem is how dotted acronyms sound.

### Authorization boundary for continuation

User previously requested no changes, then approved a **handoff-only update**, and later explicitly authorized implementing the discussed one-time narration mode. That authorization has been used **only on the experimental M4 feature branch and draft PR #9**. Do not merge or modify the working USB installation or `main` without a separate request. GitHub connector access is verified; never request GitHub passwords or personal access tokens. Subsequent changes, especially native watermark/provenance removal or background-server management, need careful review.

**Evidence location:** the user-provided screenshot, MP3 and CrispASR output are attachments in the ChatGPT conversation and **were not committed to GitHub**. Do not claim that the repository contains the private audio. The earlier standalone `gguf-first-test.wav` is separate from the newly exported Read-Aloud MP3.

---

## 1. Mission, architecture and non-negotiables

Turn the existing USB-oriented Read-Aloud proofreader into a **local expressive narration studio**, preserving its original **F8 read-from-cursor / sentence highlighting, F7 replay, F9/F10 flags, sentence selection, editing, session settings, offline Sherpa/WASM voices, and WAV/MP3 export**. Add optional CosyVoice 3 GGUF for movie narration and **selective per-sentence retakes rather than re-recording whole scenes**. Later: persistent multiple takes/locked recordings, paragraph direction, filmkit/movie-maker export, and optional authenticated remote GPU servers.

The target architecture is:

```text
Read-Aloud UI (test-copy USB folder, browser)
       |  /api/tts/cosyvoice/status and /speech; same origin + session token
       v
Read-Aloud Go launcher (M4 test copy; localhost port 17391 OR a random free port)
       |  only fixed 127.0.0.1:18080; never arbitrary target URL
       v
CrispASR v0.8.43 native server, `cosyvoice3-tts-rl` GGUF
       |  CUDA 12.6 sm_75; user-started in Git Bash
       v
GTX 1650 GPU -> PCM16 24 kHz mono WAV -> browser playback/cache
```

**No Python is needed** for the native GGUF engine. The existing WASM voices must remain functional if CrispASR is absent. Keep the main/default branch and original working USB installation untouched; **PR #9 is experimental and unmerged**.

## 2. User's tested hardware and confirmed engine success

| Item | Actual test state |
| --- | --- |
| OS | Windows x64 |
| CPU | Intel Core **i5-2400**, old Sandy Bridge without AVX2/FMA/F16C/BMI2 |
| GPU | NVIDIA **GTX 1650**, **4095 MiB VRAM**, CUDA compute capability **7.5** |
| System RAM | User reported ~20 GB |
| Native binary | **Custom** CrispASR **v0.8.43** legacy/baseline-CPU + CUDA 12.6 build from [draft PR #7](https://github.com/steveonw/read-aloud-fork/pull/7); NOT incompatible official AVX2 executable |
| Model | `cstr/cosyvoice3-0.5b-2512-GGUF`; RL Q4_K LLM, Q8_0 flow, companion F16 weights; model files cached under the user's local `crispasr` cache |
| Standalone speech | **SUCCESS**: requested `The storm was coming.`, saved `gguf-first-test.wav`, independently auditioned intelligible low-pitched narration |
| WAV result | 24,000 Hz mono PCM16; **132,000 samples / 5.50 seconds** *including ~3.44 s AI disclosure*; no invalid/all-constant speech in that uploaded file |

Custom build used `CRISPASR_PORTABLE_CPU=ON`, `GGML_CUDA=ON`, and `CMAKE_CUDA_ARCHITECTURES=75-real`. Original official executable stopped at a mandatory AVX2/FMA/F16C/BMI2 gate; custom build fixed this without unsafe ISA overrides. GTX 1650 reports a **lack of tensor cores** (speed warning, not fatal). The user's successful audio on **this specific machine** does not guarantee other legacy computers, other GPUs, long paragraphs or acting instruction fidelity.

**Critical backups:** The user explicitly reported backing up the working custom build and WAV. Preserve `~/crispasr-gguf-legacy` and GGUF weight caches. The original successful [legacy CUDA artifact](https://github.com/steveonw/read-aloud-fork/actions/runs/39192132900/artifacts/12161229037) expires 2026-11-09 UTC; because it is backed up, **do not recompile solely due to the temporary artifact expiry**.

## 3. M4 work already implemented on GitHub

[DRAFT PR #9 — Opt-in local CrispASR CosyVoice GGUF bridge](https://github.com/steveonw/read-aloud-fork/pull/9), **branch `m4/local-cosyvoice-bridge`**:
- Go launcher has a tightly constrained, loopback-only HTTP proxy: `GET /api/tts/cosyvoice/status`, `POST /api/tts/cosyvoice/speech`; status reads `http://127.0.0.1:18080/health`, speech relays to `/v1/audio/speech`. POST requires launcher CSRF token; text, voice and WAV sizes are limited.
- Optional `cosyvoice3-local` worker translates the returned 24-kHz mono PCM16 WAV into existing Read-Aloud sentence-worker events, validating structure and rejecting silence or gross clipping.
- UI: optional voice-rights checkbox and **Find local CosyVoice GGUF** button in **CosyVoice Hardware Check (Optional)**; when healthy, adds `CosyVoice 3 GGUF — English (experimental)` to the Voice dropdown. Currently only `fleurs-en` preset.
- Reuses existing in-tab unchanged-sentence audio cache, F8 pipeline, flagging/highlights, existing narration export controls; production-readiness and end-to-end export quality still require manual verification.
- Does **not** automatically launch/stop native CrispASR, download a model, store durable multiple takes, apply paragraph acting directions, deploy to Hugging Face or control remote servers.
- **Historical M4a** always spoke the AI disclaimer. **M4b** has verified opt-in narration-only speech with project-disclosure attestation (watermark stays on), while **M4c** has tested ALL-CAPS-word improvement; longer narration, durable takes and signed final-export provenance remain unfinished.

**Green CI on exact pre-handoff M4 code head** `035eb61c8bc1c10e85ce95fa45c02ba06646c26b`:
- [Core regression](https://github.com/steveonw/read-aloud-fork/actions/runs/39201631629) — success.
- [Windows M4 test kit](https://github.com/steveonw/read-aloud-fork/actions/runs/39201631639) — success.
- [Experimental M4 ZIP](https://github.com/steveonw/read-aloud-fork/actions/runs/39201631639/artifacts/12163748524) — `readaloud-m4-local-bridge-windows`, ~5.5 MB; expires **2026-11-09 UTC**. This is an **overlay update kit**, not a complete USB app. It includes new `START - WINDOWS.exe`, five `shared/` files and instructions/notice; no WASM voice assets, CrispASR executable, CUDA libraries or model files.

The user created an isolated M4 test copy from the working **GPU-check Read-Aloud USB bundle**, overlaid the M4 kit and **reported Amy/F8 worked**. **Later evening update (see Section 0):** the M4 voice was selected successfully and user-supplied MP3 plus native generation logs now confirm an actual multi-sentence browser-to-native audio/export path. The user's *original* working USB folder remains the protected baseline and must never be overwritten by an experimental kit.

## 4. Historical 404 investigation (resolved as a blocking symptom; preserve for diagnostics)

User started the custom native server in Git Bash:

```bash
cd ~/crispasr-gguf-legacy
./crispasr.exe --server --backend cosyvoice3-tts-rl -m auto \
  --voice fleurs-en --i-have-rights \
  --host 127.0.0.1 --port 18080
```

The terminal showed:
- `cpu-isa: OK — built for baseline x86-64`;
- selected CUDA GTX 1650 and cached GGUF model components;
- `crispasr-server: listening on 127.0.0.1:18080`;
- a generic `--voice-dir not set` warning for `/v1/voices` and requests with a voice field. This *may* be overly broad for built-in `fleurs-en` GGUF voice-bank presets; **at that time, server-side TTS via `/v1/audio/speech` had not yet been tested**. It was later confirmed to work using the built-in voice bank (Section 0).

Two user screenshots (2026-10-19) show:

| URL | Observed response | Meaning |
| --- | --- | --- |
| `http://127.0.0.1:18080/health` | `{"status": "ok", "backend": "cosyvoice3-tts-rl"}` | **Native CrispASR ready**. No need to download/reinstall GGUF model. |
| `http://127.0.0.1:17391/api/tts/cosyvoice/status` | **`404 page not found`** | Port 17391 is being served by a Read-Aloud instance that does **not** have the M4 route (or the updated launcher was not used). **Not evidence that the CosyVoice backend is broken.** |

**Historical leading hypothesis (never conclusively proved):** The original/older Read-Aloud had claimed port **17391**. M4 Go launcher tries that port but, if it is occupied by a different installation or build, can bind **a randomly assigned free loopback port** (see `cmd/launcher/main.go`, `findExistingServer`, then `127.0.0.1:0`). The user must check the **address of the tab the M4 test launcher actually opened**, not assume port 17391.

A second possibility: the test-copy `START - WINDOWS.exe` wasn't overlaid correctly, leaving a pre-M4 launcher that doesn't recognize the route. Test before changing any files.

**30-minute inactivity behavior:** The Read-Aloud Go launcher includes an **idleTimeout = 30 minutes** and shuts down after inactivity. Closing the tab does **not** necessarily stop the local server immediately; use the UI's **Shut down Read-Aloud** when available, or wait for idle expiry. CrispASR runs independently in Git Bash and is stopped separately with Ctrl+C. The files/models remain saved.

## 5. Resume checklist — next focused work

1. **Do not reinstall or rebuild** the verified old-CPU CUDA CrispASR binary, GGUF weights or Python. Keep Git Bash CrispASR at loopback `127.0.0.1:18080`; the Read-Aloud Go launcher remains separate. Always test in the isolated M4 folder; preserve original USB and `main`.
2. **Accept ordinary ALL-CAPS improvement for the tested phrases only.** `HEY` and `STOP RIGHT THERE` now sound like words. Keep the simple title-case rule only in the native CosyVoice speech worker. The invented example `FAFAFAFAD` remains untested.
3. **If desired, test only the dotted acronym next.** `F.B.I.` stays one labeled segment but sounds closer to “fee bee eye”. Try `F B I` and `eff bee eye` in short samples before proposing a narrow pronunciation control; no code change yet.
4. **Later:** measure sentence-boundary silence/roughness separately from pronunciation; inspect exact 5/37 integrity mismatch paths rather than disabling checks; test many-minute narration, retakes/locked takes and signed provenance. Keep the native watermark and transparent project AI disclosure.
5. **Keep PR #9 draft** and original installation/branch untouched unless the user explicitly authorizes further changes or merging.

**Accepted live:** native speech on i5-2400/GTX 1650, Read-Aloud Go bridge, clean short MP3 with project-level AI disclosure, and uppercase-word handling for `HEY` / `STOP RIGHT THERE`. **Pending:** clear `F.B.I.`, long-form durability, sample-boundary polish, verified portable checksum integrity, persistent take management, final signed provenance.

## 6. Preserve, cleanups and historical experiments

- User confirmed: **working GGUF binary and WAV are backed up**, and **old isolated Python CosyVoice installation was cleaned up manually**. Do not send Python installation commands or ask them to repeat the failed full-precision test.
- **Preserve** working new native `~/crispasr-gguf-legacy` including DLLs, `gguf-first-test.wav`, downloaded GGUF model cache, `~/cosyvoice-pilot/ReadAloudForkPilot` development checkout, original USB proofreader, user test-copy USB folder and backup ZIPs. Old incompatible **official** `~/crispasr-gguf` is not the tested native build.
- `~/cosyvoice-pilot/CosyVoice` and `~/cosyvoice-pilot/.venv` were the **old Python pilot** (user reports they are removed). No global Python uninstallation requested or performed.
- Historical native-Python full CosyVoice 3 pilot **[draft PR #6](https://github.com/steveonw/read-aloud-fork/pull/6)** produced invalid nonfinite FP16 audio on the GTX 1650; cause unconfirmed. The GGUF port supersedes it for the local pilot, **without proving full Python model parity**.
- [PR #7](https://github.com/steveonw/read-aloud-fork/pull/7) builds the **separate legacy CUDA native executable**. [PR #9](https://github.com/steveonw/read-aloud-fork/pull/9) connects Read-Aloud to an *externally running* instance of that executable. **Both are still open drafts; no merges, paid cloud host or remote deployment.**
- Some older handoff notes predate cleanup and may say Python still installed; **this M4 handoff supersedes that outdated status**.

## 7. Copy/paste summary for another conversation

> Project `steveonw/read-aloud-fork`, Issue #8 / draft PR #9 branch `m4/local-cosyvoice-bridge`. Keep `main`, original USB copy, and tested `~/crispasr-gguf-legacy` binary/GGUF cache unchanged. User's Windows i5-2400 without AVX2 and GTX 1650 run local CrispASR v0.8.43 GGUF CUDA; Read-Aloud Go proxy connects on loopback. M4b opt-in Narration Mode was verified with the two-sentence `read-aloud-narration(3).mp3` and no repeated AI voice announcement; native watermark remains ON, exported AI ID3 metadata is unsigned. **Most recent M4c acceptance:** `read-aloud-narration(4).mp3` with labels `0–0.76 HEY!`, `0.76–3.60 STOP RIGHT THERE!`, `3.60–6.16 F.B.I. is here.`. HEY and STOP RIGHT THERE are pronounced as ordinary words using simple *CrispASR-only* title-casing (`HEY`→`Hey`, `FAFAFAFAD`→`Fafafafad`); Amy/Lessac and editor unchanged. `F.B.I.` remains an imperfect “fee bee eye”; its label is one sentence. Proposed *no-code* next probes: `F B I`, `eff bee eye`; don't rewrite title-casing. Some minor gaps and old 5-of-37 integrity warning remain. M4 and core CI green at `dc9e6d3`. User MP3/labels are in chat only, not GitHub. Don't merge or change native binary without approval.

## Links

- [Full older M3 success handoff](https://github.com/steveonw/read-aloud-fork/blob/m3/gguf-legacy-cuda/docs/HANDOFF_COSYVOICE_GGUF.md)
- [M4 test setup instructions](https://github.com/steveonw/read-aloud-fork/blob/m4/local-cosyvoice-bridge/docs/M4_LOCAL_COSYVOICE_TEST.md)
- [Latest successful M4c Windows test kit](https://github.com/steveonw/read-aloud-fork/actions/runs/39361970387/artifacts/12237194691) (temporary overlay, not full USB app)
- [M4 PR #9](https://github.com/steveonw/read-aloud-fork/pull/9)
- [M4 issue #8](https://github.com/steveonw/read-aloud-fork/issues/8)
- [Legacy CUDA PR #7](https://github.com/steveonw/read-aloud-fork/pull/7)
- [Upstream CrispASR server API](https://github.com/CrispStrobe/CrispASR/blob/v0.8.43/docs/server.md)
