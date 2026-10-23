# Read-Aloud AI Narration — current handoff and next steps

**Updated:** 2026-10-22  
**Status:** Qwen3-TTS tested with (a) Ryan+Serena dramatic audiobook 3:03/53 labels, (b) Eric single-broad-direction audiobook 6:43/146 labels, and (c) **direct CrispASR 450-character multi-sentence synthesis: one WAV/42.80 seconds**. The 450-character experiment establishes paragraph inference viability but not better pacing or processing speed. Current Read-Aloud code remains **sentence-based**; an optional adaptive-paragraph mode is still only proposed. The user approves the apostrophe joke as written. **Do not merge PR #9 yet.**  
**Repository:** https://github.com/steveonw/read-aloud-fork  
**Issue:** https://github.com/steveonw/read-aloud-fork/issues/8  
**Draft PR:** https://github.com/steveonw/read-aloud-fork/pull/9  
**Working branch:** `m4/local-cosyvoice-bridge` (never `main`)  
**Stable original:** https://github.com/steveonw/Read-Aloud-Main  
**Engineering history:** [HANDOFF_M4_COSYVOICE_GGUF.md](HANDOFF_M4_COSYVOICE_GGUF.md)

## Sixth M4e field test — direct 450-character paragraph in one Qwen inference (2026-10-22)

**Purpose:** User proposed a hybrid Read-Aloud rendering mode: retain the natural continuity of a full paragraph but split when a **speaker changes**, **acting direction changes**, or a safe character limit (~450 target) would be exceeded. Long original paragraphs would be split at sentence boundaries. Individual edits would invalidate the affected audio *chunk*, not the complete story. This is an **idea, not yet implemented**.

**Direct test (outside Read-Aloud):** In a second Git Bash window, the user sent one `POST http://127.0.0.1:18080/v1/audio/speech` JSON request to the running CrispASR Qwen3-TTS 1.7B CustomVoice native server with `voice=eric`, `instructions="Like an author trying to sell a story"`, `seed=1234`, `response_format=wav`, and a modified 450-character opening excerpt of *The Apostrophe*. Output `eric-paragraph-450.wav` was uploaded in ChatGPT; **it is not in GitHub**. User did **not** supply the Bash `time` output, so generation wall time / GPU RTF cannot be claimed.

**Source input:** Exactly **450 characters, 71 whitespace-separated words, and seven sentences**, contrary to the previous assistant's accidental “six sentences” description. Relative to the original full-story opening, the test shortens “and approximately six hours” to “and six hours” and uses “the prince” instead of “a prince”; it is *not text-identical* to the older Eric Read-Aloud render.

**Verified file facts:** 42.800 s WAV, **24 kHz, mono, signed 16-bit PCM**, 1,027,200 samples, peak `0.4432` normalized (~−7.07 dBFS), zero clipped samples. Text from the first imprisonment sentence through “Apparently, we can rot” is present in the user's transcript/clip. Several natural/noticeable pauses remain, including isolated ~0.8–1.1 s low-energy intervals, so a paragraph request **does not eliminate silent gaps or guarantee tighter pacing**. One native Qwen call handled all seven sentences (Qwen is excluded from CrispASR's internal long-form sentence splitting).

**Comparison caution:** Earlier Eric-only *full story* Audacity labels for the approximately corresponding opening span **3.84–39.28 s**, or **35.44 s** excluding the title/subtitle. The new shorter/edited excerpt runs **42.80 s**, about **7.36 s longer**. These were not an exact A/B: original wording differs, earlier Read-Aloud request seeds were not fixed, separate native calls can vary, and one clip has inserted 0.4 s gaps. Do **not** interpret this difference as proven slower GPU synthesis or inferior quality; these are **audio playback durations**, not processing times.

**Architecture check (at this checkpoint):** current `web/app.js` segments on sentences and has `MAX_CHUNK=600`; `cmd/launcher/qwen_local.go` enforces **600 Unicode characters per speech request**; CrispASR 0.8.43 server documentation says `/v1/audio/speech` accepts up to **4096 input characters** by default but excludes `qwen3-tts*` from automatic long-input sentence chunking. The higher native acceptance cap does **not** imply high-quality 4096-character generations. The proposed adaptive mode should start with **~450 characters target, 600 hard cap** and split at speaker or acting changes and sensible sentence/paragraph boundaries, not at arbitrary byte boundaries.

**Unresolved design conflict:** Today every generated sentence has its own measured clip boundary and accurate sentence-based Audacity label. If multiple sentences become **one WAV**, that WAV yields a real chunk start/end only; **individual sentence timestamps are unknown unless separately aligned**. Do not fabricate timestamps. For an experimental mode, start with paragraph/chunk-level labels and F8-at-chunk behavior or add an explicit alignment engine in a later milestone; keep sentence mode (proofreading, F7/F8, word-level ambitions) unchanged. A changed word would invalidate a whole paragraph take, not retain single-sentence retake granularity. Preserve stable editor/source offsets, cache keys scoped to effective voice, acting, text and chunk identity, and previously approved takes when implementing.

**Next rational test:** Render the **exact same** 450-character text once as a single native Qwen request and once as sentence-based Read-Aloud Eric acting, then compare narration pauses, diction, acoustic consistency, and measured request wall time, with seed/cache caveats. **No code or main/USB/model changes were made for this experiment.**

## Fifth M4e field export — Eric solo storyteller, one acting prompt, full-length excerpt (2026-10-22)

**User supplied:** Complete longer original story excerpt through "One by one, they turned their horses around.", preceded only by the independent markers:

```text
⟦speaker=eric⟧
⟦acting="Like an author trying to sell a story"⟧
```

The user uploaded **`read-aloud-narration(2).wav`** and **`read-aloud-narration-labels(7).txt`** in ChatGPT, **not GitHub**. This tests a **single narrator preset and one broad instruction** for the entire story, including dialogue and comic shifts; no character-specific instruction changes. The user specifically likes the apostrophe joke and does **not** want it rewritten or "fixed" just because it is a writing joke.

**Verified technical facts:** WAV **403.440 seconds (6:43.44)**, 24,000 Hz mono PCM16. **146 chronological Audacity sentence labels**, from 0.000 to 403.440 seconds, with no overlaps or missing timeline. Of 145 label gaps, **82 = 0 s** and **63 = 0.4 s**. Approximately **830 spoken words** by a simple label tokenizer (~**123 words/minute**, including pauses, approximate only); peak absolute PCM amplitude **0.7814 (-2.14 dBFS)**, zero clipped samples. Marker text absent from labels, and all labelled story sections through the knights turning around are present. The two title lines, "The Apostrophe" and "A Writing Prompt Story", **are spoken**, as they were left in the body. This is structurally a successful long-form Read-Aloud WAV+labels export.

**Listen/sampling impressions and limitations:** Several samples across the opening, dragon conversation, parchment joke, knight entrance, angry exchanges and closing show a consistent Eric narrator base with some changes in emphasis/intensity. The high-energy Sir Reginald exchanges sound more forceful than descriptive narration, but **a single preset does not give each dialogue character a separately identifiable voice**. The broad "author trying to sell a story" direction seems viable for dramatic reading with sarcasm and high-energy lines, without the micromanaged acting prompts used in the earlier test. These are **qualitative impressions**, not a scored blind A/B of acting fidelity; only one Eric recording was provided.

The all-caps parchment sign `COME SAVE THE PRINCE'S` has its own ~2.00-second label at **179.28–181.28 s**, and the shouted all-caps lines near the knights' introduction also have distinct labelled intervals. The labels **do not prove every syllable was pronounced perfectly**; don't infer that from timestamps. No missing output or obvious long silence appears at the apostrophe reveal or Sir Reginald's rant. Keep the *existing* punchline as the user prefers.

**Apples-to-apples caution:** The earlier Ryan/Serena version was an assistant-**condensed** adaptation of just the first part (183.36 s/53 labels), while the new Eric test includes the **longer original story** through the knights departing (403.44 s/146 labels). Therefore the increased runtime and label count say **nothing about Eric being slower or faster than Ryan/Serena**, nor whether one prompt is causally more natural. The bridge still sends **one sentence at a time** with its inherited same speaker and acting text, not the entire 6-minute story in one native request. The actual synthesis wall-clock time and generation seed were not measured.

**Next useful comparison (if requested):** render **the exact same 30–60 seconds** with Eric `acting=auto` versus Eric with the one broad storytelling instruction, with cache-conscious repeat settings; compare pacing, expression and fidelity. Keep this as an **optional experiment**, not a gate before approved-take persistence or an excuse to rewrite the apostrophe joke. No runtime code, models, stable USB or `main` changed for this review.

## Fourth M4e field export — The Apostrophe comic audiobook (2026-10-22)

**User submission:** `read-aloud-narration(1).wav` and `read-aloud-narration-labels(6).txt` uploaded **in ChatGPT only, not GitHub**. The supplied story was first condensed into a controlled audiobook test by the assistant, using **Ryan as both first-person prince/narrator and dialogue**, and **Serena as Vesper the dragon**. Acting directives covered dry sarcasm, indignation, friendship, mock-authority, exasperation, deception and resignation, alternating repeatedly between speakers. The assistant's test script was an adaptation, **not a verbatim rendering of all original story paragraphs**; distinguish adaptation decisions from model transcription errors.

**Verified WAV and label facts:** **183.360 s (3:03.36)**, **24 kHz mono, 16-bit PCM**. Exactly **53 ordered sentence Audacity labels**, first begins `0.000`, final ends `183.360`. Of 52 between-label gaps, **24 are 0 s** and **28 are 0.4 s**, all nonnegative; no missing/timing-overlapping intervals. Maximum absolute sample amplitude is **0.858** of full-scale, with **zero clipped PCM samples**. Labels preserve the script's dialogue order, and no Unicode `⟦speaker=...⟧` / `⟦acting=...⟧` markers are voiced or labelled. This validates export structure, **not automatically phoneme-accurate alignment or all semantic content**.

**Audition findings (qualitative):**
- **Clear improvement over the artificial escalating-instruction stress test:** Ryan and Serena remain easy to distinguish throughout many exchanges and character returns. Ryan gives sarcastic/wry narrator delivery with more indignant dialogue, while Serena stays dry, composed and distinct. Dialog back-and-forth retains pace; several jokes work (pillow eaten, feather mattress shortage, discriminatory human civilization).
- Serena's preset timbre is rather **light/young** for a vast ancient intimidating dragon; prompting adds character attitude, but does not fundamentally change preset speaker identity. This is a creative casting tradeoff, not a bridge error.
- The line **"I hated her. Mostly."** at approximately **69.44–74.80 s** includes a conspicuous extra chuckle/breathy acting flourish; amusing but arguably overperformed. The line **"And so, on the one hundred and thirty-eighth day..."** at approximately **108.64–118.24 s** includes an awkward start/stumble, worth regenerating **that one sentence** rather than rewriting the engine. The final **"The dragon sighed."** at **181.44–183.36 s** includes extra vocalization/sigh-like effect; decide whether acceptable artistic acting or undesired non-text speech. Some pronunciation around `Vesper` and `Knights rescue princesses, Vesper` also merits a targeted human listen rather than assumed global correction.
- **Creative clarification from the user:** The user considers the apostrophe joke to work **as spoken** and does **not** want it rewritten just to explain the spelling. The earlier assistant suggestion that the joke *needed* a narrated apostrophe cue was an interpretation, not a proven defect; **do not treat it as a required fix**. Preserve the joke unless the user asks for a rewrite.
- The scene is **3:03 of generated audio**, not a measurement of generation processing time or peak VRAM. Do not use duration to claim that Qwen rendered faster/slower than real time.

**Development consequence:** Keep short, scoped acting directions and independently persistent speaker markers. The demonstrated audiobook can be used for **real selective-regeneration and approved-take persistence acceptance**: lock the good 50-ish sentences; optionally target the stumbled sentence or any unwanted extra chuckle/sigh without re-synthesizing good passages. Leave the apostrophe joke alone unless asked. Test name pronunciation and character-appropriate voices by audition, not by default global transformations. Do not add a giant theatrical instruction to solve a single bad word. The test does not yet establish durable locked takes, persistence over restart, or sample-accurate label placement.

**Project safety:** The experimental draft PR is still unmerged, original `Read-Aloud-Main` and USB untouched. This is a **documentation-only** review of user-supplied WAV and labels; no code/model settings were modified.

## Third M4e field export — 11-stage acting-complexity WAV test (2026-10-22)

**User submission:** `read-aloud-narration.wav` and `read-aloud-narration-labels(5).txt` uploaded in the ChatGPT conversation, **not committed to GitHub**. This is the progressive acting-direction stress test proposed after the first expressive-acting MP3.

**Verified file facts:** 41.900-second WAV, 24,000 Hz mono, signed 16-bit PCM. Exactly **11 Audacity label intervals**, in playback order, with ten **0.750-second** inter-label gaps. All labels fit within the recording and terminate exactly at 41.900 seconds. Audio peaks remain below digital full-scale; no sample-level clipping. Markers `⟦speaker=...⟧` / `⟦acting=...⟧` are absent from spoken output and labels. The full test completed with intelligible speech.

**Controlled part (stages 1–7):** each line says exactly **"I didn't expect to see you here."**, using Vivian with increasingly complex acting prompts:

| Stage | Acting request | Audio duration | Initial assessment |
| --- | --- | --- | --- |
| 1 | natural/auto | 2.08 s | fluent neutral control |
| 2 | simple happiness | 1.92 s | audible prosodic change, happiness somewhat restrained |
| 3 | sadness with trembling voice | 2.56 s | slower/more delicate delivery, partial style match |
| 4 | crying with happiness | 2.56 s | playful/breathy emotion, literal tears not clearly conveyed |
| 5 | outward delight concealing fear | 2.48 s | more nuanced hidden fear not reliably distinguishable |
| 6 | relieved disbelief → suspicion → quiet fear | 2.48 s | no clear three-part emotional sequence |
| 7 | nervous laugh → guilt → happy tears → terror | 2.72 s | expressive reading, but four requested shifts not independently distinguishable |

The recordings have objectively different acoustic duration and RMS levels, but that **alone does not prove instruction-following**. Subjective judgments of mixed feelings are provisional. Most notable limitation is **precise sequential emotion within one short utterance**, emerging around stages **5–7**. There was no catastrophic text loss or audio breakdown; this is **instruction-control fidelity**, not a computational crash or definitive model 'intelligence ceiling'. Stage 7 only has 2.72 seconds of speech to perform four psychological transitions, so the test itself is demanding beyond prompt length.

**Scenes 8–11:** Vivian whispers fear (5.84 s), Ryan answers under the *inherited* frightened acting direction (4.96 s), Vivian returns with relieved-to-alarmed direction (3.36 s), and `acting=auto` resets the narrator (3.44 s). Both speaker change and return to neutral are audible and the label timing structure holds. Stage 10 conveys alarm but not a clearly controlled relief-to-desperate-shout transition within one sentence. Changes in stages 8–11 also change text, voice and acting, so don't use them as a controlled single-variable emotion benchmark.

**Reproducibility caution:** current `web/qwen3-local.worker.js` and `cmd/launcher/qwen_local.go` do **not** supply a fixed request seed; unlike the previous direct CrispASR curl experiments, this Read-Aloud export is **not seed-controlled**. Sentence-level cache keys include the acting text, which prevents different directives from accidentally reusing identical cached audio, but repeated runs may retrieve the existing cache instead of synthesizing new audio. A single instance per stage cannot support a statistical claim about the first reliable failure.

**Recommendation:** treat single emotions and inherited cross-speaker scene acting as proven useful. For nuanced multi-transition acting, prefer separate short acting scopes/clauses and human audition; do not automatically normalize uppercase or force increasingly verbose prompts. If testing the model limit further, repeat stages 4–7 with a **longer, semantically appropriate line**, and control generation variability/caching before concluding a hard threshold. No application code was changed for this review.

## Second M4e user export — independent speaker switch and Audacity labels (2026-10-22)

The user uploaded **`read-aloud-narration(7).mp3`** and its companion **`read-aloud-narration-labels(4).txt`** directly in ChatGPT, **not into GitHub**. The user explicitly confirmed that **James switches voices**. On listening, the lower voice on James's lines is distinct from Vivian, followed by a switch back to Vivian for the screaming line. Unicode directive markers do not appear in the narration or the label texts.

**Audio metadata checked:** MP3, 24,000 Hz, mono, duration **26.448 s**. The labels file contains exactly **10 non-overlapping, chronologically ordered spans**, beginning at **0.000 s** and ending at **26.390 s** (audio has **0.058 s** remaining). Consecutive label gaps are only **0.12 or 0.35 s**. No label extends beyond audio duration. This checks export timeline consistency, **not sample-accurate phoneme alignment inside Audacity**.

| Label span(s) | Per-sentence text and expected direction |
| --- | --- |
| 0.00–4.83 s, 2 labels | Vivian frightened: "James, don't move." + "He's standing right outside the door." |
| 4.95–10.10 s, 2 labels | Ryan, same frightened acting: "I can hear his footsteps getting closer." + "What are we going to do?" |
| 10.22–15.16 s, 3 labels | Vivian panicked: "JAMES!" + "RUN!" + "HE'S COMING!" |
| 15.28–20.35 s, 2 labels | Vivian relieved/happy-crying: "Oh, thank God you're alive!" + "I thought I'd lost you forever!" |
| 20.47–26.39 s, 1 label | Vivian natural after `acting=auto`: "The hallway fell silent..." |

**Assessment:** Speaker switching and independent acting changes are audibly promising; the speech/labels export retains the intended sequence and skips directive lines. The elongated/less intelligible **"RUN!"** remains the main acting-quality issue. One export plus timestamps does **not** establish F8-from-cursor inheritance, cache reuse under edits, durability of approved takes, or sample-accurate label alignment. The precise CrispASR speaker ID for Ryan was not captured in a native console log, although the audible voice difference is obvious.

**Next practical checks:** change only `RUN!` to `Run!` and compare its isolated re-render, test F8 from James's line to confirm earlier acting remains inherited, then import the labels into Audacity and visually confirm boundaries at the intended sentences. Avoid rebuilding or adding features until these acceptance checks are done. Stable USB and `main` remain untouched.

## User's first M4e Speaker + Acting MP3 acceptance test (2026-10-22)

**Source:** user uploaded `read-aloud-narration(6).mp3` in ChatGPT (NOT committed to GitHub) after running the five-scene script supplied for the experimental Qwen3-TTS integration. The MP3 is **26.448 seconds, 24 kHz mono** (64 kb/s encoding). The supplied audio/transcription reaches the final natural narrator sentence; **no Unicode direction markers were spoken**.

The script used five blocks, each as its own sentence with inherited independent directives:

1. `speaker=vivian`, acting "Whispering in terror, breathless, trying not to be heard." — "James, don't move. He's standing right outside the door."
2. `speaker=ryan`, **no acting change** — "I can hear his footsteps getting closer. What are we going to do?"
3. `speaker=vivian`, acting "Suddenly screaming in absolute horror, voice cracking with panic." — "JAMES! RUN! HE'S COMING!"
4. **same Vivian**, acting "Crying with happiness, laughing uncontrollably through tears of relief." — "Oh, thank God you're alive! I thought I'd lost you forever!"
5. `acting=auto` **only** — "The hallway fell silent, and the old clock continued ticking as though nothing had happened."

**Review:** The James sentence is audibly a much lower male-sounding voice compared with Vivian, consistent with a successful Ryan switch **while retaining the frightened delivery**. The switch back to Vivian and acting changes are audible: panicked/intense screaming, then relieved emotional delivery, then comparatively neutral storytelling. The screaming line's **"RUN!"** becomes elongated/warbled and less intelligible; first-line "whisper" is also more emphatic than purely whispered, and "happy crying" conveys relief more consistently than literal laughter/sobbing. These are voice-model/performance quality issues to iterate, not evidence of marker-parsing failure. No sample peaks near digital clipping in the MP3.

**Limits of this evidence:** The recording supports correct order of different-sounding voices and directions and omission of markers, but **does not independently verify native `spk_id` for Ryan**, or F8-from-middle, safe cache invalidation, timing-label alignment, or durable locked takes. The last behaviors still require separate testing. Do not claim full feature sign-off. The test was performed against the experimental copy and the original stable program remains intact.

**Smallest next quality A/B test:** re-render only the screaming sentence with **"James! Run! He's coming!"** instead of all uppercase, leaving Vivian and the acting direction unchanged. Compare whether `Run` articulates better without losing the intense emotion. Prefer a targeted per-sentence audition over applying global uppercase normalization prematurely. Retain working Qwen and CosyVoice as a fallback. No code changes were needed to review this MP3.

## New experimental implementation checkpoint — Speaker and Acting controls (2026-10-22)

A **new M4e experimental code change** was prepared for the draft PR: separate visible **Insert Speaker** and **Insert Acting** buttons, a freeform acting text field and optional examples, plus a **Reset acting** control. The script stores standalone Unicode `⟦speaker=...⟧`, `⟦acting="..."⟧`, `⟦acting=auto⟧` lines. Speaker and emotion persist independently: a new speaker inherits the existing fear, and a new emotion keeps the current speaker. Invalid markers are skipped and reported. No directives are spoken; F8-from-cursor uses preceding state; the existing per-sentence timing, exports and in-memory cache are preserved. Qwen speaker plus instruction are included in the sentence cache identity.

Qwen is offered only after a successful local `/api/tts/qwen/status` discovery; backend remains a **separate optional bridge** from the tested CosyVoice path. Go requests use fixed localhost port 18080, validate speaker presets and length, and do not allow arbitrary paths, remote URLs, watermark opt-outs or forged disclosure fields. The first integration retains Vivian as the startup preset and forwards changes to the other known Qwen speaker names per sentence. **At the time of this implementation checkpoint, per-request speaker switching and the updated browser experience had not yet been user-tested.** The later MP3 acceptance test above provides strong audible evidence of those features, though it does not independently verify the native Ryan speaker ID. Automated Go/Node tests and Windows overlay CI are designed to run before the next human test. No persistent take vault or paragraph-alignment feature has been added.

See [M4 test guide](M4_LOCAL_COSYVOICE_TEST.md) for the test sequence; retain CosyVoice as fallback, Amy/Lessac as default proofreading voices, and both original USB and `main` untouched.

## Current milestone — 2026-10-22: Qwen3-TTS acting instructions work in first real Windows WAV test

The user **successfully started the existing custom CrispASR v0.8.43 CPU+CUDA executable** as a separate local server with:

```bash
cd ~/crispasr-gguf-legacy
./crispasr.exe --server --backend qwen3-tts-1.7b-customvoice -m auto \
  --voice vivian --host 127.0.0.1 --port 18080
```

The same binary resolved/downloaded **`qwen3-tts-12hz-1.7b-customvoice-q8_0.gguf` (~2.0 GB)** and **`qwen3-tts-tokenizer-12hz.gguf` codec**, loaded both, and reached `listening on 127.0.0.1:18080`. A GTX 1650 with 4 GB total VRAM was detected. No CrispASR rebuild, Python install, or Read-Aloud change was required. The CosyVoice backup weights and command remain intact.

Three direct HTTP `POST /v1/audio/speech` calls used identical text ("Please stay with me, I cannot face tomorrow without you."), **seed 1234**, and the same `vivian` voice inherited from server startup; only `instructions` changed (none, crying, happy). The user provided the WAVs **in ChatGPT, not GitHub**:

| User WAV | Direction | WAV result |
| --- | --- | --- |
| `normal(1).wav` | no instructions | 5.04 sec |
| `crying(1).wav` | sad, trembling, holding back tears | 6.24 sec |
| `happy.wav` | happy/excited/almost laughing | 3.92 sec |

All decode at **24 kHz mono**. The samples are **not identical**; on listening, the crying reading is more breathy/strained, the happy reading quicker/brighter and the normal reading calmer. **This is strong preliminary evidence the native Qwen CustomVoice backend genuinely receives acting instructions on the user's hardware.** The line's sad wording may limit how convincingly "happy" sounds. Only short-sentence acting is verified; long-form consistency/quality is not.

User reports generation felt **very fast**, but no precise per-request generation durations were supplied, so **do not claim a measured Qwen real-time factor from WAV durations**.

**New next milestone:** With the user's go-ahead, add Qwen as an **optional selectable voice engine in the isolated Read-Aloud M4 Go proxy/browser worker**, passing paragraph/scene direction as per-sentence `instructions`. Keep one sentence per synthesis, existing replay/timing/label/export pipeline, stable Amy/Lessac and CosyVoice as fallback, and any approved takes outside changed spans untouched. Before adding duplicate take functionality, audit what Read-Aloud already provides. Model/voice/direction/settings must be considered in cache identity. Test with three adjacent paragraphs and different directions before expanding.

The separately built **CrispASR Server Control** GUI is still **CosyVoice-only** and only CI-tested; actual on-PC buttons are not yet verified. Do not attempt to launch its CosyVoice while the manual Qwen server already occupies port `18080`. Do not overwrite original working Read-Aloud, `main`, or CrispASR binaries.


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

## 4. Historical findings before the successful 2026-10-22 Qwen test (superseded above)

The user generated **two WAVs directly from CrispASR without Read-Aloud**, identical text and seed, with/without an instruction to speak as if crying. The audio samples were **identical**. This confirms that the **current CrispASR CosyVoice path is not applying that emotional instruction**. Do not add paragraph emotion text boxes that silently do nothing.

The user queried `GET http://127.0.0.1:18080/backends`. Their existing custom executable listed `qwen3-tts-customvoice`, `qwen3-tts-1.7b-customvoice`, and `qwen3-tts-1.7b-voicedesign`. **The backend code is compiled in; this does NOT prove the Qwen GGUF/codec weights are downloaded, that it fits in 4 GB VRAM, or that acting works on this Windows box.**

CrispASR v0.8.43's Qwen3-TTS CustomVoice native adapter contains optional style-instruction support; verify that the **HTTP /v1/audio/speech `instructions` field actually reaches this variant**, since the API docs particularly describe VoiceDesign instructions. Qwen **1.7B CustomVoice GGUF** is the leading candidate for **same character voice + different emotions**. VoiceDesign is a possible later option for character descriptions; consistency between sentences must be tested.

This should be a **server-only WAV comparison first**, not an immediate Read-Aloud replacement.

## 5. Original pre-test development outline (Qwen experiment completed; follow current milestone above)

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
- Qwen acting variation is confirmed for **three short user-supplied WAVs only**. Do not claim long-form consistency, fully working paragraph controls, the server-controller GUI on the user's PC, or persistent locked takes until separately tested.
- No further code changes without discussion of the next specific feature and the user's go-ahead.

## 7. Copy/paste prompt for the next chat

> Continue Read-Aloud fork, Issue #8, draft PR #9 on `m4/local-cosyvoice-bridge`; read `docs/HANDOFF_NEXT_SESSION.md`. The **latest result is a direct 450-character, seven-sentence single-request Qwen3-TTS CustomVoice test** using Eric and one acting direction `Like an author trying to sell a story`, `seed=1234`, output `eric-paragraph-450.wav` **42.80s / 24 kHz PCM16 mono**, clean output, 0 clipped samples, but still some nearly one-second pauses. The input text was edited slightly from the original and is therefore not a strict A/B. The earlier Eric full audiobook used individual sentences and produced **6:43.44 / 146 Audacity labels**, whereas a corresponding beginning section lasted about 35.44s (new paragraph clip was 42.80s, but text/seed/gaps differ). User asks about implementing **hybrid adaptive paragraph rendering**: aim ~450 characters/600 hard maximum, pack contiguous same-speaker/same-acting sentences into one synthesis job, split on paragraph, speaker, acting, length; edits require rerendering only that chunk, not the whole story. **This is not built yet.** Existing Go Qwen bridge allows max 600 chars, native CrispASR allows up to 4096 input chars and processes Qwen multi-sentence input as a single call. Critical compatibility issue: 1 chunk WAV has only real chunk timing, cannot promise current per-sentence Audacity labels without alignment. Preserve existing sentence mode as default, original USB, Read-Aloud-Main, main, models, Qwen native server, disclosures and watermark. User likes apostrophe joke unchanged. Only proceed with new code after clear user request; no merge of PR #9 without acceptance. Actual synthesis wall time wasn't supplied.
