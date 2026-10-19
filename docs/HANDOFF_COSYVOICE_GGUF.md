# Project handoff — Read-Aloud fork + CosyVoice 3 GGUF on legacy Windows

**Updated:** 2026-10-18 (US Eastern; the successful GitHub Actions run is dated 2026-10-19 UTC)  
**Status:** The custom CrispASR **Python-free** executable successfully generated and saved an **audibly intelligible** CosyVoice 3 GGUF narration WAV on the user's old Windows desktop. **It is not yet integrated into Read-Aloud, packaged as a release, or approved as broadly compatible.**  
**Resume point:** Safeguard the working download/build and recordings, then plan careful cleanup of the old separate Python installation and a future Read-Aloud backend integration.

## 1. Project mission / non-negotiables

Fork [steveonw/Read-Aloud-Main](https://github.com/steveonw/Read-Aloud-Main) as [steveonw/read-aloud-fork](https://github.com/steveonw/read-aloud-fork). Preserve the working Read-Aloud **portable USB-style browser editor, F8 read-from-cursor with sentence highlighting, F7 replay, F9/F10 flags, sentence selections, pronunciation/settings/session storage, WAV/MP3 narration export, and CPU/WASM proofreading fallback**. Add a separate, optional **CosyVoice 3 expressive narration backend** for human and AI movie-making workflows, supporting sentence-by-sentence retakes, saved/locked takes and project exports. Avoid rebuilding a whole movie scene when only one spoken line needs correction.

**Never disable the proofreader just because an optional GPU backend is absent.** A native GPU gate should test hardware/runtime availability and handle out-of-memory gracefully. Future local and authenticated remote GPU services should share one audio interface. No Hugging Face server/Space has been deployed and no paid GPU host has been activated.

## 2. Hardware and successful system

- User's test host: **Windows x64**, **Intel Core i5-2400 (2011 Sandy Bridge)**; lacks **AVX2, FMA, F16C, BMI2**; about **20 GB system RAM**.
- NVIDIA **GeForce GTX 1650 4 GiB**, compute capability **7.5 / sm_75**, existing working NVIDIA driver; CUDA 12.6 compatible runtime bundled with our custom CrispASR executable.
- **CrispASR v0.8.43** based on pinned upstream commit `eb633d908120cc5f44b8af8cd4aeb1191f16bfd8`, compiled on GitHub-hosted Windows 2022 with **`CRISPASR_PORTABLE_CPU=ON` + `GGML_NATIVE=OFF` + `GGML_CUDA=ON` + `CMAKE_CUDA_ARCHITECTURES=75-real`**.
- No Python or PyTorch installation is required for the **GGUF / CrispASR** runtime. The separate prior Python-based CosyVoice pilot did use Python 3.10.
- Working model is `cstr/cosyvoice3-0.5b-2512-GGUF`: **RL-tuned Q4_K LLM** (`cosyvoice3-llm-rl-q4_k.gguf`), **Q8_0 flow** plus F16 tokenizer, vocoder, voice-bank and speaker conditioning components. Model-file size is not a measured VRAM peak.

### What was broken and how it was fixed

1. Official CrispASR Windows CUDA prebuilt started but rejected this CPU at actual inference startup because its CPU helpers required AVX2/FMA/F16C/BMI2. **Merely running `--version` is not a sufficient test:** the program exits before executing its ISA gate.
2. Custom GitHub Actions build enabled portable/baseline CPU kernels **while retaining CUDA sm_75 support**. On the actual i5-2400, model-free startup reached the deliberately missing GGUF model check without any CPU ISA rejection and successfully enumerated the GTX 1650.
3. The subsequent real `-m auto` GGUF test downloaded the model and **successfully synthesized real speech**.

**Do not use `CRISPASR_IGNORE_CPU_ISA=1` to suppress hardware warnings.** That can cause illegal-instruction crashes in incompatible prebuilts. GPU acceleration still requires CPU work and correct CPU instructions.

## 3. Proven listening test — success

Run from **Git Bash**, inside the successfully installed new directory (example: `~/crispasr-gguf-legacy`):

```bash
cd ~/crispasr-gguf-legacy

./crispasr.exe --backend cosyvoice3-tts-rl -m auto \
  --voice fleurs-en --i-have-rights \
  --tts "The storm was coming." \
  --tts-output gguf-first-test.wav
```

**User-reported CLI output:**
- `[backends: cpu,cuda]`, GPU `NVIDIA GeForce GTX 1650`, CUDA0 selected, GGUF model loaded, synthesizer generated speech tokens.
- `crispasr: TTS output written to 'gguf-first-test.wav' (132000 samples @ 24000 Hz, 5.50 sec)`.
- SHA-256 of original result: `6f0cd218bc578517161cf634333c1f242499e29c556353bbf90842476c091ae2`.

**Actual uploaded WAV was reviewed by listening.** It audibly contains the standard AI disclaimer followed by a clear lower-pitched narrator saying **"The storm was coming."** Audio inspection recorded PCM16 mono **24,000 Hz / 132,000 samples / 5.50 s**, all decoded samples finite, peak amplitude **0.738** (no full-scale clipping). This establishes **one short successful recording** and resolves the immediate question of whether speech is possible on this exact hardware. It does not yet establish acceptable long-form acting, speed, continuity, peak VRAM, concurrency or other old computers.

**Why 5.50 s for a short sentence?** CrispASR by default synthesizes the spoken AI disclosure **"This audio was generated by artificial intelligence"** (~3.44 s), then a short silence, then the requested words. This is expected. Upstream documents `--no-spoken-disclaimer` only with `--accept-marking-responsibility` and an appropriate alternate AI disclosure; preserve provenance/consent. `--i-have-rights` is an explicit voice-use attestation; do not use unconsented reference recordings.

The warning about **GTX 1650 lacking tensor cores** and the **HiFT SIMDCONV fallback** is a possible speed limitation, **not** a blocker to the demonstrated recording.

## 4. Where everything lives

| Item | Where / link | Notes |
| --- | --- | --- |
| Fork | https://github.com/steveonw/read-aloud-fork | Preserve working Read-Aloud application; default branch is **not** the GGUF experiment. |
| **GGUF / legacy CUDA build** | https://github.com/steveonw/read-aloud-fork/pull/7 | **Draft, open**, branch `m3/gguf-legacy-cuda`. Contains Windows build workflow and documentation. |
| Successful GitHub Actions run | https://github.com/steveonw/read-aloud-fork/actions/runs/39192132900 | **Green**: build, baseline CPU configuration, CUDA build, smoke checks, artifact upload. |
| Tested artifact ZIP | https://github.com/steveonw/read-aloud-fork/actions/runs/39192132900/artifacts/12161229037 | `crispasr-legacy-cpu-gtx1650-cuda126`; ~784 MiB ZIP, **expires 2026-11-09 UTC**. **Download and back up a copy before expiry**. |
| Local custom engine | `~/crispasr-gguf-legacy/` | Contains custom `crispasr.exe` and DLLs. **Keep**. |
| Good first WAV | `~/crispasr-gguf-legacy/gguf-first-test.wav` | **Keep and back up.** The user also uploaded it into the chat. |
| Model source | https://huggingface.co/cstr/cosyvoice3-0.5b-2512-GGUF | Components auto-downloaded by `-m auto`; check actual cache paths before moving/deleting files. |
| Native Python CosyVoice pilot | https://github.com/steveonw/read-aloud-fork/pull/6 | **Draft, open**, branch `m2b/native-cosyvoice-pilot`, distinct experiment. |
| Old Python CosyVoice | `~/cosyvoice-pilot/CosyVoice/` and `~/cosyvoice-pilot/.venv/` | **Not deleted yet**; they can be retired later after backups and explicit user approval. |
| Read-Aloud checkout | `~/cosyvoice-pilot/ReadAloudForkPilot/` | **Do not delete**, contains fork/pilot code. |
| Original official CrispASR package | `~/crispasr-gguf/` | Earlier incompatible AVX2-required binary; not the working one. Verify before any deletion. |
| EquationWright local gateway example | https://github.com/steveonw/equationwright/tree/main/gateway | Go gateway can launch `llama-server` and serve a local loopback chat API. Reuse the **architecture concept**, not its text-chat API verbatim, for local TTS. |

## 5. Separate failed Python/FP16 pilot (do not repeat blindly)

The official `FunAudioLLM/Fun-CosyVoice3-0.5B-2512` full model successfully imported and loaded in isolated Python 3.10 with PyTorch CUDA, but GTX 1650 **FP16 output was invalid**. The debug render returned **32,640/32,640 non-finite raw audio samples** (NaN/Inf) before WAV conversion. The earlier PCM16 file held constant `-32768` samples (flatline/hum). An audio-integrity gate was added to PR #6 to reject corrupted output. **Root cause was not isolated**; fp16 numerical instability and VRAM pressure remain hypotheses. The user declined a long CPU/FP32 diagnostic run, and there is no need to ask for it again. The GGUF success does not establish that the official Python model would work locally.

## 6. Safe next steps (priority order)

1. **Preserve the successful custom executable ZIP, its DLLs and good WAV.** Action artifacts expire; the known-working CI artifact currently expires **2026-11-09**. Consider a properly licensed/versioned **GitHub Release** later if distribution is desired, but do not publish user recordings or personal references.
2. **Back up useful projects and diagnose where GGUF weights are cached** before removing/moving anything. Ask permission before cleanup. Only then retire the dedicated old `CosyVoice/` checkout and `.venv/` under `~/cosyvoice-pilot/`; **leave installed system Python, `ReadAloudForkPilot/`, new `crispasr-gguf-legacy/`, working Read-Aloud USB files, GGUF models and WAV recordings intact**.
3. **Check one more short sample and, later, a longer paragraph**, optionally different voices, pronunciation and expressive direction, while measuring system RAM/VRAM and avoiding repeat runs if unstable. Voice acting/instruct support in CrispASR must be independently verified; don't assume full parity with upstream Python `inference_instruct2`.
4. **Integrate as an optional engine** behind the Read-Aloud launcher's local loopback service or a long-running local TTS HTTP service (inspired by EquationWright's gateway). Return sentence WAVs, support retakes and cached/locked takes, keep human proofreading UI and WASM fallback working when native backend is unavailable. Browser UI should not expose backend secrets.
5. **Optional later**: secure, authenticated remote GPU/Hugging Face server path; more generalized Windows/Linux/macOS portable builds; compare GGUF vs full precision for quality and memory. **Nothing has been deployed, paid for, or switched on at Hugging Face**.

**Do not merge either draft PR (#6 or #7) as a production-ready narration studio yet.** The GGUF standalone executable works on the tested machine; UI integration and acceptance tests remain.

## 7. One-paragraph prompt to resume in another chat

> We're building `steveonw/read-aloud-fork` into a USB-friendly narration/proofreading studio without losing F8/F7/F9/F10, highlights, retakes or WASM fallback. The separate native Python CosyVoice3 FP16 pilot in draft PR #6 yielded all-NaN/Inf audio on GTX 1650 and was not fixed. We instead built CrispASR v0.8.43 GGUF with `CRISPASR_PORTABLE_CPU=ON`, CUDA 12.6 sm_75 in draft PR #7, GitHub Actions run 39192132900. It **works** on Windows Intel i5-2400 (no AVX2) + GTX 1650 4GB: `./crispasr.exe --backend cosyvoice3-tts-rl -m auto --voice fleurs-en --i-have-rights --tts "The storm was coming." --tts-output gguf-first-test.wav` produced a clear 24kHz 5.5s WAV (including 3.44s standard spoken AI disclaimer), audibly verified. The artifact expires 2026-11-09. We have **not** deleted old `~/cosyvoice-pilot/CosyVoice` or its `.venv`, and **not** integrated CrispASR with Read-Aloud yet. Next: back up working ZIP/WAV, safely plan old Python cleanup with confirmation, then design a local Go gateway or TTS server adapter for sentence retakes and future optional remote hosting. Do not claim broader compatibility or merge drafts yet.

---
**References:** [GGUF source](https://github.com/CrispStrobe/CrispASR), [GGUF model](https://huggingface.co/cstr/cosyvoice3-0.5b-2512-GGUF), [working build PR #7](https://github.com/steveonw/read-aloud-fork/pull/7), [native Python PR #6](https://github.com/steveonw/read-aloud-fork/pull/6).
