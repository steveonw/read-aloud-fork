# Read-Aloud AI Narration — current handoff and next steps

**Updated:** 2026-10-20  
**Status:** Working experimental CosyVoice integration; next goal is expressive paragraph/scene acting. **Do not merge PR #9 yet.**  
**Repository:** https://github.com/steveonw/read-aloud-fork  
**Issue:** https://github.com/steveonw/read-aloud-fork/issues/8  
**Draft PR:** https://github.com/steveonw/read-aloud-fork/pull/9  
**Working branch:** `m4/local-cosyvoice-bridge` (never `main`)  
**Stable original:** https://github.com/steveonw/Read-Aloud-Main  
**Engineering history:** [HANDOFF_M4_COSYVOICE_GGUF.md](HANDOFF_M4_COSYVOICE_GGUF.md)

## 1. What the user actually wants

**Read-Aloud-Main was already a working proofreader.** It was chosen because sentence-by-sentence playback, F7 replay, cursor/F8 control, timing, sentence/paragraph pauses, caching, exports, and Audacity text labels were already useful. We are **not** trying to replace that foundation or build a conventional TTS app.

The intended next stage is an **AI script/narration and voice-acting editor**: assign acting or voice directions to a paragraph or scene (e.g. calm narrator; mother crying; joyful speaker; frightened child), and let that direction continue **until the next direction or an explicit stop marker**. **Keep individual sentences as the immutable generation, replay, cache, edit, replace, and timing units.** A change in one paragraph must not regenerate or disturb approved sentences in unrelated paragraphs. Character identity and acting emotion are distinct settings; convincing child voices may need separate presets.

Do not push generic speed benchmarks, unrelated acronym fixes, a rewritten editor, or take-management redesign unless real use reveals a need. The user said the present CosyVoice voice is sufficiently clear for script proofreading.

## 2. Hardware and two local servers

- Windows x64; Intel **i5-2400** lacking AVX2; **GTX 1650 4 GB** CUDA GPU; about **20 GB RAM**.
- The proven native executable is a **custom portable/baseline-CPU + CUDA CrispASR v0.8.43** build in `~/crispasr-gguf-legacy`, with cached GGUF assets. **Do not replace it with a stock AVX2 build or reinstall Python/models just to continue.** Legacy engine build tracked in [draft PR #7](https://github.com/steveonw/read-aloud-fork/pull/7).
- **Server A:** Read-Aloud's Go launcher/web UI on local loopback (e.g. `127.0.0.1:17391`; actual port may vary).
- **Server B:** separate **CrispASR** model server, `127.0.0.1:18080`. Its working CosyVoice startup is:

```bash
cd ~/crispasr-gguf-legacy
./crispasr.exe --server --backend cosyvoice3-tts-rl -m auto \
  --voice fleurs-en --i-have-rights --host 127.0.0.1 --port 18080
```

- The two servers are connected by the Read-Aloud **Go loopback proxy** and CosyVoice browser worker; do not expose the model server on `0.0.0.0`. The GGUF model stays loaded across individual sentence requests.

## 3. What has been implemented and actually tested

1. **M4 integration:** the local CrispASR CosyVoice 3 English preset (`fleurs-en`) is selectable in experimental Read-Aloud; F8, sentence timing/cache and WAV/MP3 export work. Amy and Lessac remain separate and unchanged.
2. **Narration Mode (M4b):** session-only, OFF by default. After explicit voice-rights/project-disclosure affirmation, the Go proxy asks CrispASR to omit the *repeated spoken* AI announcement and checks the upstream response. The native audio watermark remains enabled. Stitched WAV/MP3 receive **ordinary AI-generated metadata**, but the browser export is **not signed C2PA**; appropriate final-project AI disclosure is still required.
3. **Real MP3 acceptance:** user shared an MP3 speaking **“The storm was coming. The road was empty.”** without repeating the spoken AI announcement.
4. **Uppercase speech workaround (M4c):** **CosyVoice-only** spoken-input title-casing (`HEY` → `Hey`, `FAFAFAFAD` → `Fafafafad`); leaves `F.B.I.` with periods intact and preserves the editor and Amy/Lessac. User audio confirmed `HEY!` and `STOP RIGHT THERE!` are ordinary spoken words. `F.B.I.` sounded imperfect (“fee bee eye”); this is minor, not the current project priority.
5. **Real long narration:** user supplied a **16 min 51 sec**, **342-labeled-segment** MP3 and matching script/label material. The full MP3 decoded, and the labels covered the story from beginning to end. User reported approximately **1:1 generation speed**; a **51-request excerpt** supported about **1.11× real-time factor**, *not a measured speed for the entire 17-minute job*. This is a useful real-world sentence-render-and-export test; no need to demand another generic 10-minute benchmark.
6. **Server-control mini app (M4d):** separate portable Windows GUI with **Start / Stop / Refresh / Browse / Open folder** to operate the proven CosyVoice server without Git Bash. It checks `/health`, rejects a duplicate on port 18080, and stops only its own verified process (PID, start time, executable path). It is **not integrated into Read-Aloud and does not switch models yet**. Windows CI **compiled and passed offline self-tests**; **actual user-machine startup/stop still awaits testing**.

The user-supplied audio and label files were provided **in ChatGPT**, not added to the GitHub repository. GitHub automated tests do not prove hardware voice quality.

**Mini-controller build:** https://github.com/steveonw/read-aloud-fork/actions/runs/39374421045  
**Mini-controller ZIP:** https://github.com/steveonw/read-aloud-fork/actions/runs/39374421045/artifacts/12243165572 (temporary)  
**Controller instructions:** [../tools/crispasr-server-control/README.md](../tools/crispasr-server-control/README.md)  
**Windows M4 test-copy guide:** [M4_LOCAL_COSYVOICE_TEST.md](M4_LOCAL_COSYVOICE_TEST.md)

## 4. Important direct test: why we are considering Qwen3-TTS

The user generated **two WAVs directly from CrispASR without Read-Aloud**, identical text and seed, with/without an instruction to speak as if crying. The audio samples were **identical**. This confirms that the **current CrispASR CosyVoice path is not applying that emotional instruction**. Do not add paragraph emotion text boxes that silently do nothing.

The user queried `GET http://127.0.0.1:18080/backends`. Their existing custom executable listed `qwen3-tts-customvoice`, `qwen3-tts-1.7b-customvoice`, and `qwen3-tts-1.7b-voicedesign`. **The backend code is compiled in; this does NOT prove the Qwen GGUF/codec weights are downloaded, that it fits in 4 GB VRAM, or that acting works on this Windows box.**

CrispASR v0.8.43's Qwen3-TTS CustomVoice native adapter contains optional style-instruction support; verify that the **HTTP /v1/audio/speech `instructions` field actually reaches this variant**, since the API docs particularly describe VoiceDesign instructions. Qwen **1.7B CustomVoice GGUF** is the leading candidate for **same character voice + different emotions**. VoiceDesign is a possible later option for character descriptions; consistency between sentences must be tested.

This should be a **server-only WAV comparison first**, not an immediate Read-Aloud replacement.

## 5. Agreed development direction — next sessions

**First, minimal user check:** Try the new **CrispASR Server Control** GUI on Windows. If CrispASR is already running in Git Bash, stop it *there* with Ctrl+C; open the GUI, choose the existing `crispasr.exe`, press Start, check its health and Read-Aloud connectivity, close/reopen the GUI, and try Stop. Do not assume CI proves it works on the target PC. Do not overwrite the native binary.

**Second, when the user wants to experiment:** Make an **isolated Qwen3-TTS CustomVoice test on Server B only**:
- Preserve the known-good CosyVoice command/models. Stop CosyVoice before loading Qwen; do not run both large models on a 4 GB GPU.
- Identify exactly which Qwen **GGUF model and tokenizer/codec** files are required and whether they are cached. Ask before large downloads or changes.
- Load Qwen using the existing CrispASR executable if it works, without rebuilding Read-Aloud. Use a preset speaker and a fixed short line; record direct **normal, sad/crying, happy** WAVs, ideally at identical seeds.
- Compare **actual audible differences, stability, clipping, generated-audio duration, latency and GPU memory**. Also check whether disclosure behavior is acceptable; do not assume a different model removes legal disclosure responsibilities.
- If instructions are ignored, investigate the HTTP-to-backend instruction path before any UI work. If memory or performance fails, keep CosyVoice as the working fallback and assess a smaller model/quantization.

**Third, only if that test succeeds:** Add Qwen as an **optional selectable backend** through the existing Go proxy/browser worker and implement nonspoken **paragraph/scene acting directions**:
- A direction applies from its paragraph/scene marker until the next direction or an explicit stop/reset marker.
- Keep **one-sentence requests** and Read-Aloud's existing timing, flags, Audacity labels, and exports.
- Cache keys include sentence text, voice identity, acting prompt, model/settings/seed as appropriate. Changing a direction should only invalidate **affected unlocked** audio.
- Approved/locked sentence takes remain unchanged, even when surrounding text or emotions change; persist approved takes safely between sessions, rather than assuming today's in-memory sentence cache is durable.
- Do not mix text editing with spoken instructions or automatically regenerate outside the selected scope. Test paragraph controls with three short adjacent paragraphs before larger stories.

**Separately, when convenient:** investigate the old **“5 of 37 files failed integrity”** test-overlay warning by identifying exact filenames/hashes; do not disable checks to hide it. More extensive quality checks, precise acronym pronunciation, and signed final-export provenance come *after* useful emotional acting and reliable packaging.

## 6. Safety and project boundaries

- Keep the original [Read-Aloud-Main](https://github.com/steveonw/Read-Aloud-Main), the original USB install, existing `~/crispasr-gguf-legacy` executable and cached models unchanged. Use an isolated M4 test-copy folder.
- Work only on draft PR #9 / `m4/local-cosyvoice-bridge` unless explicitly authorized. **Do not merge into `main`** or assume a packaged experimental ZIP is a complete USB distribution.
- Continue to require rights to use the voice and responsible AI-generated-audio disclosure. Do not silently disable watermark/provenance to avoid an audible announcement.
- Do not claim Qwen voice emotion control, the mini-controller GUI, or persistent locked takes have already been proven on the user's computer.
- No further code changes without discussion of the next specific feature and the user's go-ahead.

## 7. Copy/paste prompt for the next chat

> Continue the Read-Aloud AI narration project at `steveonw/read-aloud-fork`, Issue #8, **draft PR #9** on `m4/local-cosyvoice-bridge`. **Read `docs/HANDOFF_NEXT_SESSION.md` first**, then the older `docs/HANDOFF_M4_COSYVOICE_GGUF.md` for engineering history. The stable original is `steveonw/Read-Aloud-Main`; preserve original USB and native CrispASR. User has Windows i5-2400 (no AVX2), GTX 1650 4GB, proven CrispASR v0.8.43 portable CPU+CUDA at localhost:18080 and Read-Aloud Go UI on its own local port. CosyVoice GGUF voice, per-sentence F8/timing, one-session clean narration, MP3/Audacity labels and a 16:51 / 342-segment real export are working. A separate GUI server controller passed Windows CI but has NOT yet been user-tested. **Real goal:** paragraph/scene acting directions (crying, happy, child, narrator) while retaining single-sentence generation and preserving approved recordings outside emotion ranges. Direct CosyVoice normal-vs-crying WAVs were identical, so do **not** build emotion UI on current CosyVoice. Existing CrispASR lists Qwen3-TTS CustomVoice/VoiceDesign backends, but no Qwen weights or voice-emotion test has been verified. **Next:** test controller on the user's PC; when approved, run direct Qwen normal/sad/happy WAVs on the existing second server before any Go/Read-Aloud changes. Keep CosyVoice as fallback, no reinstall or premature merges, keep watermark and AI disclosure.

