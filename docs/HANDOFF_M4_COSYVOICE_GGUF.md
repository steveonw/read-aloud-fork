# Project handoff — M4 Read-Aloud + local CosyVoice 3 GGUF

**Updated:** 2026-10-19, late evening (US Eastern; user evidence posted 2026-10-20 UTC)  
**Repository:** [steveonw/read-aloud-fork](https://github.com/steveonw/read-aloud-fork)  
**Current work:** [Issue #8](https://github.com/steveonw/read-aloud-fork/issues/8) / [DRAFT PR #9](https://github.com/steveonw/read-aloud-fork/pull/9) (`m4/local-cosyvoice-bridge`)  
**Resume point:** The native CrispASR/CosyVoice 3 GGUF engine, Go bridge, Read-Aloud and clean two-sentence MP3 were verified working on the user's Windows i5-2400 + GTX 1650. The repeated spoken AI announcement is resolved in the session-only Narration Mode. User then reported ALL-CAPS pronunciation (`HEY` spelled H E Y). The newest experimental fix applies **only in the CosyVoice worker**: ordinary ALL-CAPS words are converted to first-letter uppercase (`HEY` → `Hey`, `FAFAFAFAD` → `Fafafafad`), while dotted initials (`F.B.I.`) remain untouched. No acronym allowlist; the previous approach was superseded at the user's request. Await new Windows audio listening verification; don't modify the working original USB or `main`, and keep the PR draft. The unrelated 5/37 integrity warning still needs checking.

This is the latest handoff. The [earlier M3 handoff](https://github.com/steveonw/read-aloud-fork/blob/m3/gguf-legacy-cuda/docs/HANDOFF_COSYVOICE_GGUF.md) records the complete legacy-CPU build and the successful standalone audio test.

## 0. Latest checkpoint — Read-Aloud/CosyVoice speech and MP3 SUCCESS (2026-10-19 evening US Eastern)

**This section overrides the earlier "native Read-Aloud TTS still untested" wording below.** The earlier port-17391 404 and "start the server" message were troubleshooting checkpoints, not the current blocker.

### M4b implementation — approved and committed after the successful MP3 test

The user subsequently authorized implementing the agreed approach ("ok do what you need to do"). The existing **draft PR #9** now contains optional **Narration mode**: user first confirms voice rights and explicitly accepts responsibility to disclose AI narration in the final project. The checkbox is **OFF by default**, remains local to the browser session, and is intentionally **not saved to settings or autosave**. It initializes the CosyVoice worker with a boolean; the Go bridge maps it to the upstream `spoken_disclaimer=false` and fixed `marking_attestation` values. Go refuses a "clean" speech response unless upstream confirms `X-Crispasr-Spoken-Disclaimer: skipped`. Sentence cache keys distinguish disclosed vs narration-mode lines, so the wrong takes cannot leak across mode switches.

The browser stitches native speech into new WAV/MP3 files, losing native signed C2PA chunks/headers. M4b labels the output with **plain** WAV LIST/INFO and MP3 ID3 AI-generated metadata; these exports **are not signed C2PA**. The audible disclaimer can be omitted only after affirmative project-level disclosure acceptance; the **inaudible watermark stays enabled** for the native engine, and the user must display an appropriate AI-generated-speech disclosure in the published work. This update **does not** add `--no-watermark`, `--no-c2pa`, new model downloads, background engine startup or full voice cloning.

**GitHub verification:** successful [M4 Windows test-kit build + Node/Go contract tests](https://github.com/steveonw/read-aloud-fork/actions/runs/39358205181) and successful [core regression](https://github.com/steveonw/read-aloud-fork/actions/runs/39358205111) on the first M4b implementation commit `b22d35e`. Follow-up MP3-mode metadata race fix is in progress. **This note is historical: the later M4b Windows MP3 did verify clean speech.** Leave PR #9 draft until that test and review.

### Newest checkpoint: M4b accepted; simplified M4c speech capitalization in progress

- User provided `read-aloud-narration(3).mp3` after checking Narration Mode:
  "The storm was coming. The road was empty." The repeated AI
  announcement was absent. Plain AI-generated MP3 metadata was present;
  it was not a signed C2PA export. See [the PR acceptance note](https://github.com/steveonw/read-aloud-fork/pull/9#issuecomment-6281949216).
- The user noticed native CosyVoice was spelling ALL-CAPS words (e.g.
  `HEY` as H E Y), unlike the original Amy and Lessac voices.
  The native implementation's text-normalization path may differ from
  the original Python model; that causal diagnosis is not yet proven.
- The first M4c patch used an uppercase acronym exception list, but the
  user requested a **simpler rule restricted to CrispASR/CosyVoice**:
  title-case every unpunctuated uppercase word and leave dotted initials
  unchanged. Current experimental worker now sends `HEY` as `Hey`,
  `FAFAFAFAD` as `Fafafafad`, `FBI` as `Fbi`, but leaves
  `F.B.I.` unchanged. Uppercase contractions such as `DON'T` and
  `I'M` remain readable. There is **no acronym allowlist**.
- **Only `web/cosyvoice-local.worker.js` carries this speech-only
  transformation.** The editor, highlighted spans, text labels, Go
  proxy, and original Amy/Lessac workers are unchanged. The existing
  voice-consent check, default spoken disclosure, optional Narration
  Mode and watermark stay intact.
- After the latest green GitHub M4 test-kit build, install the new
  overlay only in the isolated M4 test copy (never the original USB).
  Keep Git Bash CrispASR running and listen to
  `HEY! STOP RIGHT THERE! F.B.I. is here.`. Only the actual user's
  MP3 can verify whether the model speaks this wording correctly.
  Spelling out `F.B.I.` is a model-language behavior to confirm, not
  something the regex itself guarantees.

### Confirmed on the actual user machine

- Screenshot: local Read-Aloud test UI at `http://127.0.0.1:17391/` shows **"CosyVoice 3 GGUF — English is ready"**, with **"CosyVoice 3 GGUF — English (experimental)"** selected in Voice. The old 404/bridge-discovery blocker is no longer preventing selection. The precise cause of the earlier launcher mix-up was not conclusively established.
- User supplied an exported file named **`read-aloud-narration(2).mp3`**, containing multiple generated sentences narrated by the CosyVoice voice. The separate spoken line **"This audio was generated by artificial intelligence"** is audible before **every** sentence. This proves that the Read-Aloud → Go bridge → native server → speech audio/export flow has worked on the user's computer; it does **not** prove that exports are movie-ready or that all editing/replay/retake paths are correct.
- User supplied a corresponding Git Bash/CrispASR generation log. Repeated `[CONSENT]` records for `voice=fleurs-en` include **`spoken_disclaimer=yes`**; many `crispasr-server: synthesized ... format=wav ... sr=24000Hz` entries confirm real native per-sentence synthesis. The first sample shows 19.1 seconds of audio synthesized in 12.17 seconds (RTF 0.64); different lines vary with input length and GPU state.
- Native startup loads **8 voices** from the built-in GGUF voice bank, including `fleurs-en`, with **CUDA0** active and the legacy CPU-compatible build. The generic `--voice-dir not set` startup warning did **not** prevent this actual named-bank voice from synthesizing audio through Read-Aloud. Do **not** add an arbitrary voice directory or change the working startup command on the basis of that warning alone.
- Screen still shows **"Warning: 5 of 37 files on this drive failed their integrity check"** while the voice reports ready. A stale `SHA256SUMS.txt` from the original USB bundle is the *leading explanation*, because the M4 kit replaces five `shared/` files without regenerating the original manifest. **Not yet verified**: the names/hashes of the five failed files. Do not delete the checksum manifest, ignore unexpected DLL changes, or alter the original working USB copy.

### Primary functional problem: AI disclosure repeated per sentence

The current M4 Go bridge deliberately omits a `spoken_disclaimer` override; the upstream server therefore uses its default `spoken_disclaimer=true` for **each separate sentence request**. The repeated ~3.44 s phrase makes the exported sequence unsuitable for practical narration; this is a **known product blocker**, not a GPU, networking or model-loading failure.

**Remaining design and testing (M4b core feature now implemented on draft PR #9; further high-impact changes still require review):**
1. Preserve informed voice-consent/rights checks. Design an **opt-in project-level disclosure/provenance workflow** that meets CrispASR's applicable marking-attestation rules before requesting `spoken_disclaimer=false` on individual narration lines. Preserve upstream watermark/C2PA handling where supported, and keep audible disclosure enabled until the alternative marking requirements are actually met; do **not** merely trim/strip the announcement from finished WAVs or suppress it silently.
2. Exercise the upstream `POST /v1/audio/speech` request, Go proxy, browser worker, F8 playback, unchanged-sentence cache, and WAV/MP3 export with both default disclosure and an appropriately attested alternative mode. Add mocked tests; verify real resulting audio on the GTX 1650 before calling it ready.
3. Independently address integrity reporting by identifying actual five failed files from launcher logs, then prepare a checksum-correct **complete test bundle** or properly validated overlay manifest process; retain diagnostics instead of hiding warnings.
4. Once narrative audio is clean and policy-compliant, continue **persistent sentence takes, retakes/locking, project manifests, and acting controls** as distinct future features.

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
- The native worker **does not disable the spoken AI disclosure**: CrispASR prefixes its disclosure to *each sentence* for this first test. Do not use this M4 edition for final movie audio yet; future project-level AI disclosure/marking must respect consent and provenance.

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

## 5. Resume checklist — current priorities (do not repeat solved install/network tests)

1. **Preserve today's success.** User has already demonstrated the CosyVoice voice selectable/ready in M4 Read-Aloud and supplied a real generated MP3. Keep the custom `~/crispasr-gguf-legacy` binary, model cache, audio backups, original USB app, and test-copy USB app intact. Do not reinstall Python, CUDA, or GGUF models and do not repeat the basic 404 troubleshooting unless the bridge genuinely regresses.
2. **Discuss disclosure architecture before changing code.** Highest-priority blocker is the repeated **"This audio was generated by artificial intelligence"** sentence, not failing speech generation. Review CrispASR's actual `spoken_disclaimer=false` attestation/marking gates, distinguish preset/clone requirements, and propose a transparent project-level disclosure, export provenance, and consent UX. Keep watermark/C2PA as applicable and an appropriately disclosed default.
3. **Request explicit approval for implementation.** The user has authorized this **handoff update**, but previously prohibited unapproved application changes. Do not alter any source file, working binary, generated audio, `main`, or PR merge status until they approve a specific next step.
4. **When approved, implement on draft PR #9 (or a clearly separated feature branch)** with targeted Go/JS tests; preserve Amy/WASM, existing F7/F8/F9/F10 functions, sentence caching, editing, and exports. Test that per-line narration does not repeat the spoken announcement only under valid alternative-disclosure attestation, and ensure default mode remains disclosed.
5. **Diagnose the USB integrity warning separately.** Examine launcher integrity log for the exact five failed paths. Do not suppress the checks or delete `SHA256SUMS.txt` simply to hide the warning. Package a complete reproducible test copy / verified overlay with correct manifest when appropriate.
6. **Then** verify the full sentence retake, cache and final WAV/MP3 workflow on the user's hardware, followed by persistent multiple takes/locked clips and later acting-direction controls. Avoid claiming final film production readiness until successful real tests and disclosure design.

**Current acceptance achieved:** CosyVoice 3 local model started successfully, Read-Aloud voice selected, multi-sentence synthesis and MP3 export produced. **Not yet accepted:** clean narration without per-sentence disclaimer, checksum-clean test package, saved multiple takes, emotional direction, and production-grade export.

## 6. Preserve, cleanups and historical experiments

- User confirmed: **working GGUF binary and WAV are backed up**, and **old isolated Python CosyVoice installation was cleaned up manually**. Do not send Python installation commands or ask them to repeat the failed full-precision test.
- **Preserve** working new native `~/crispasr-gguf-legacy` including DLLs, `gguf-first-test.wav`, downloaded GGUF model cache, `~/cosyvoice-pilot/ReadAloudForkPilot` development checkout, original USB proofreader, user test-copy USB folder and backup ZIPs. Old incompatible **official** `~/crispasr-gguf` is not the tested native build.
- `~/cosyvoice-pilot/CosyVoice` and `~/cosyvoice-pilot/.venv` were the **old Python pilot** (user reports they are removed). No global Python uninstallation requested or performed.
- Historical native-Python full CosyVoice 3 pilot **[draft PR #6](https://github.com/steveonw/read-aloud-fork/pull/6)** produced invalid nonfinite FP16 audio on the GTX 1650; cause unconfirmed. The GGUF port supersedes it for the local pilot, **without proving full Python model parity**.
- [PR #7](https://github.com/steveonw/read-aloud-fork/pull/7) builds the **separate legacy CUDA native executable**. [PR #9](https://github.com/steveonw/read-aloud-fork/pull/9) connects Read-Aloud to an *externally running* instance of that executable. **Both are still open drafts; no merges, paid cloud host or remote deployment.**
- Some older handoff notes predate cleanup and may say Python still installed; **this M4 handoff supersedes that outdated status**.

## 7. Copy/paste summary for another conversation

> Continue Issue #8 / draft PR #9 `m4/local-cosyvoice-bridge` in
> `steveonw/read-aloud-fork`. User's Win64 i5-2400 (no AVX2) + GTX 1650
> runs custom CrispASR v0.8.43 GGUF CosyVoice3 CUDA binary from
> `~/crispasr-gguf-legacy`; existing server on 127.0.0.1:18080 works.
> Read-Aloud Go server at 127.0.0.1:17391 (or auto-assigned port)
> forwards sentence requests. M4b session-only Narration Mode successfully
> eliminated the repeated AI voice announcement on user's real
> two-sentence MP3, while native watermark and unsigned metadata remain.
> Latest issue: all-uppercase `HEY` is spelled H E Y. **User explicitly
> requested a simple rule for only the CrispASR voice**: title-case
> unpunctuated uppercase words (`HEY` → `Hey`; `FAFAFAFAD` →
> `Fafafafad`) and keep dotted initials `F.B.I.` unchanged.
> The earlier hard-coded acronym exception list has been removed from the
> native worker. Amy/Lessac, original editor text, labels, highlights,
> user USB installation and main branch MUST remain untouched.
> Await new M4 Windows CI and the user's listening test. There is still a
> separate USB integrity warning 5 of 37 files; investigate file hashes
> before changing manifest. Never reinstall models/Python or merge draft
> PR #9 without the user's explicit go-ahead.

## Links

- [Full older M3 success handoff](https://github.com/steveonw/read-aloud-fork/blob/m3/gguf-legacy-cuda/docs/HANDOFF_COSYVOICE_GGUF.md)
- [M4 test setup instructions](https://github.com/steveonw/read-aloud-fork/blob/m4/local-cosyvoice-bridge/docs/M4_LOCAL_COSYVOICE_TEST.md)
- [M4 Windows test kit](https://github.com/steveonw/read-aloud-fork/actions/runs/39201631639/artifacts/12163748524) (temporary)
- [M4 PR #9](https://github.com/steveonw/read-aloud-fork/pull/9)
- [M4 issue #8](https://github.com/steveonw/read-aloud-fork/issues/8)
- [Legacy CUDA PR #7](https://github.com/steveonw/read-aloud-fork/pull/7)
- [Upstream CrispASR server API](https://github.com/CrispStrobe/CrispASR/blob/v0.8.43/docs/server.md)
