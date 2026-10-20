# Project handoff — M4 Read-Aloud + local CosyVoice 3 GGUF

**Updated:** 2026-10-19 (US Eastern)  
**Repository:** [steveonw/read-aloud-fork](https://github.com/steveonw/read-aloud-fork)  
**Current work:** [Issue #8](https://github.com/steveonw/read-aloud-fork/issues/8) / [DRAFT PR #9](https://github.com/steveonw/read-aloud-fork/pull/9) (`m4/local-cosyvoice-bridge`)  
**Resume point:** **Native CrispASR is healthy, but Read-Aloud has not yet connected successfully.** The browser was pointed at an old/wrong Read-Aloud origin or an incorrectly overlaid launcher; **two Read-Aloud instances were open**, and the user is pausing for the night. **Do not reinstall models or start over.**

This is the latest handoff. The [earlier M3 handoff](https://github.com/steveonw/read-aloud-fork/blob/m3/gguf-legacy-cuda/docs/HANDOFF_COSYVOICE_GGUF.md) records the complete legacy-CPU build and the successful standalone audio test.

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
- The native worker **does not disable the spoken AI disclosure**: CrispASR prefixes its disclosure to *each sentence* for this first test. Do not use this M4 edition for final movie audio yet; future project-level AI disclosure/marking must respect consent and provenance.

**Green CI on exact pre-handoff M4 code head** `035eb61c8bc1c10e85ce95fa45c02ba06646c26b`:
- [Core regression](https://github.com/steveonw/read-aloud-fork/actions/runs/39201631629) — success.
- [Windows M4 test kit](https://github.com/steveonw/read-aloud-fork/actions/runs/39201631639) — success.
- [Experimental M4 ZIP](https://github.com/steveonw/read-aloud-fork/actions/runs/39201631639/artifacts/12163748524) — `readaloud-m4-local-bridge-windows`, ~5.5 MB; expires **2026-11-09 UTC**. This is an **overlay update kit**, not a complete USB app. It includes new `START - WINDOWS.exe`, five `shared/` files and instructions/notice; no WASM voice assets, CrispASR executable, CUDA libraries or model files.

The user created an isolated M4 test copy from the working **GPU-check Read-Aloud USB bundle**, overlaid the M4 kit and **reported that the Amy voice/F8 worked**. However, they later revealed that **two Read-Aloud launchers were open simultaneously**, so the active browser page's exact origin must be confirmed before counting this as proof of the native M4 route working. The user's *original* working USB folder was meant to remain unchanged and should not be overwritten by any experimental kit.

## 4. Latest observed issue — native server OK, Read-Aloud route 404

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
- a generic `--voice-dir not set` warning for `/v1/voices` and requests with a voice field. This *may* be overly broad for built-in `fleurs-en` GGUF voice-bank presets; **server-side TTS via `/v1/audio/speech` has not yet been tested**. Do not assume it either works or fails based on the warning alone.

Two user screenshots (2026-10-19) show:

| URL | Observed response | Meaning |
| --- | --- | --- |
| `http://127.0.0.1:18080/health` | `{"status": "ok", "backend": "cosyvoice3-tts-rl"}` | **Native CrispASR ready**. No need to download/reinstall GGUF model. |
| `http://127.0.0.1:17391/api/tts/cosyvoice/status` | **`404 page not found`** | Port 17391 is being served by a Read-Aloud instance that does **not** have the M4 route (or the updated launcher was not used). **Not evidence that the CosyVoice backend is broken.** |

**Leading hypothesis (not yet proven):** The original/older Read-Aloud had claimed port **17391**. M4 Go launcher tries that port but, if it is occupied by a different installation or build, can bind **a randomly assigned free loopback port** (see `cmd/launcher/main.go`, `findExistingServer`, then `127.0.0.1:0`). The user must check the **address of the tab the M4 test launcher actually opened**, not assume port 17391.

A second possibility: the test-copy `START - WINDOWS.exe` wasn't overlaid correctly, leaving a pre-M4 launcher that doesn't recognize the route. Test before changing any files.

**30-minute inactivity behavior:** The Read-Aloud Go launcher includes an **idleTimeout = 30 minutes** and shuts down after inactivity. Closing the tab does **not** necessarily stop the local server immediately; use the UI's **Shut down Read-Aloud** when available, or wait for idle expiry. CrispASR runs independently in Git Bash and is stopped separately with Ctrl+C. The files/models remain saved.

## 5. Resume checklist — do this *next*, in order (one small test at a time)

1. **No reinstalls.** Confirm any drafts are saved. Cleanly shut down *both* Read-Aloud sessions (not just browser tabs) and close the browser tabs. Do not touch the original USB folder, good WAV, model cache or known-working custom CrispASR folder.
2. Launch **only the M4 test-copy** `START - WINDOWS.exe`. Observe **its actual new tab URL**. It may be `http://127.0.0.1:17391/` **or another `127.0.0.1:<port>/`**. This is the port to use for all Read-Aloud diagnostic URLs, not always 17391. Confirm Amy/F8 remains available.
3. Restart or leave running native CrispASR **in a separate Git Bash window** with the exact command above, binding **127.0.0.1:18080**, then check [native health](http://127.0.0.1:18080/health) for `"status":"ok"` and `"backend":"cosyvoice3-tts-rl"`.
4. In the M4 Read-Aloud test tab, navigate to **`http://127.0.0.1:<THE_M4_TAB_PORT>/api/tts/cosyvoice/status`**. Interpret:
   - `"state":"ready"`: bridge sees native server; proceed.
   - `"reason":"server_not_ready"`: recheck `18080/health`, availability and launcher restart.
   - `"reason":"wrong_backend"`: upstream has wrong speech engine loaded.
   - **404**: the opened Read-Aloud instance/port is not the M4 Go launcher or the update kit wasn't fully installed; verify the M4 test-copy EXE before altering models.
5. If `ready`: return to M4 tab, expand **CosyVoice Hardware Check (Optional)**, check **I have the rights to use the selected CosyVoice preset** if true, click **Find local CosyVoice GGUF**, select `CosyVoice 3 GGUF — English (experimental)`, paste **`The storm was coming.`**, and press **F8**. Keep an eye on the Git Bash server terminal.
6. Record whether a WAV/audio is returned and *audible* in Read-Aloud. If it fails, capture **exact Read-Aloud error, exact M4 tab URL, status endpoint JSON and last relevant CrispASR terminal lines** (no need to send private recording or API tokens). In particular test the generic `--voice-dir` warning only if the actual speech request fails.
7. If end-to-end speech succeeds, continue with non-destructive sentence editing/unchanged cache and draft WAV export tests, then design persistent audio takes, project-level disclosure, and a convenient engine launcher. **Keep PR #9 draft until tested and reviewed.**

**Do not claim that the above F8 CosyVoice test has already succeeded.** As of this handoff, the standalone GGUF WAV has been listened to; the browser-to-native speech path has **not**.

## 6. Preserve, cleanups and historical experiments

- User confirmed: **working GGUF binary and WAV are backed up**, and **old isolated Python CosyVoice installation was cleaned up manually**. Do not send Python installation commands or ask them to repeat the failed full-precision test.
- **Preserve** working new native `~/crispasr-gguf-legacy` including DLLs, `gguf-first-test.wav`, downloaded GGUF model cache, `~/cosyvoice-pilot/ReadAloudForkPilot` development checkout, original USB proofreader, user test-copy USB folder and backup ZIPs. Old incompatible **official** `~/crispasr-gguf` is not the tested native build.
- `~/cosyvoice-pilot/CosyVoice` and `~/cosyvoice-pilot/.venv` were the **old Python pilot** (user reports they are removed). No global Python uninstallation requested or performed.
- Historical native-Python full CosyVoice 3 pilot **[draft PR #6](https://github.com/steveonw/read-aloud-fork/pull/6)** produced invalid nonfinite FP16 audio on the GTX 1650; cause unconfirmed. The GGUF port supersedes it for the local pilot, **without proving full Python model parity**.
- [PR #7](https://github.com/steveonw/read-aloud-fork/pull/7) builds the **separate legacy CUDA native executable**. [PR #9](https://github.com/steveonw/read-aloud-fork/pull/9) connects Read-Aloud to an *externally running* instance of that executable. **Both are still open drafts; no merges, paid cloud host or remote deployment.**
- Some older handoff notes predate cleanup and may say Python still installed; **this M4 handoff supersedes that outdated status**.

## 7. Copy/paste summary for another conversation

> Resume M4 for `steveonw/read-aloud-fork`. Goal: USB-friendly Read-Aloud F8 proofreading plus optional local CosyVoice3 GGUF narration, one sentence at a time, preserve Amy/WASM/flags/exports and eventually saved retakes. Intel **i5-2400** no AVX2 + NVIDIA **GTX1650 4GB** + Windows, ~20GB RAM. In **draft PR #7**, built custom CrispASR v0.8.43 with baseline x86-64 + CUDA sm_75. Standalone CLI `cosyvoice3-tts-rl` **already produced an audibly clear** `gguf-first-test.wav` with `The storm was coming.` Native engine and WAV **backed up**. Old dedicated Python CosyVoice install **manually cleaned up**. In **draft PR #9**, M4 Go loopback speech bridge, worker, rights-gated voice dropdown, mock tests and Windows update kit are built; CI was green. M4 test-copy was installed from the GPU-check USB bundle and user reports Amy/F8 works, but **CosyVoice F8 has NOT yet worked through Read-Aloud**. User had two Read-Aloud launchers open. Screenshots: native `127.0.0.1:18080/health` = `{"status":"ok","backend":"cosyvoice3-tts-rl"}`; `127.0.0.1:17391/api/tts/cosyvoice/status` = **404**. Leading theory: port 17391 served by old Read-Aloud while M4 bound a different port, OR M4 EXE overlay wasn't applied. Next: cleanly close both Read-Aloud servers, open only the **M4 test-copy launcher**, inspect its real address bar port, check **`/api/tts/cosyvoice/status` at that exact origin**; restart CrispASR local `--server ... --port 18080` as needed, then opt in to rights/Find local CosyVoice/F8 a short sentence. Never reinstall model solely for this 404, never delete working USB or native files. Keep both PRs draft until end-to-end tests.

## Links

- [Full older M3 success handoff](https://github.com/steveonw/read-aloud-fork/blob/m3/gguf-legacy-cuda/docs/HANDOFF_COSYVOICE_GGUF.md)
- [M4 test setup instructions](https://github.com/steveonw/read-aloud-fork/blob/m4/local-cosyvoice-bridge/docs/M4_LOCAL_COSYVOICE_TEST.md)
- [M4 Windows test kit](https://github.com/steveonw/read-aloud-fork/actions/runs/39201631639/artifacts/12163748524) (temporary)
- [M4 PR #9](https://github.com/steveonw/read-aloud-fork/pull/9)
- [M4 issue #8](https://github.com/steveonw/read-aloud-fork/issues/8)
- [Legacy CUDA PR #7](https://github.com/steveonw/read-aloud-fork/pull/7)
- [Upstream CrispASR server API](https://github.com/CrispStrobe/CrispASR/blob/v0.8.43/docs/server.md)
