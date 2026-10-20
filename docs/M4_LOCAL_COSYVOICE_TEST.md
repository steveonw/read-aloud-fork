# M4a — Experimental local CosyVoice3 GGUF bridge

> **Current checkpoint:** CosyVoice 3 GGUF successfully narrated sentences through Read-Aloud, with the user supplying a real MP3 and server logs. The earlier port-17391 404 is historical. This M4b test adds explicit opt-in narration without repeated spoken AI announcements; see the [latest project handoff](HANDOFF_M4_COSYVOICE_GGUF.md).

**Status: draft feature branch, not merged or included in a normal USB release.**
This deliberately small integration connects the working **CrispASR v0.8.43
GGUF/Q4_K RL** binary to the existing **Read-Aloud F8 proofreader**. There is no
Python dependency, cloud server, automatic download or automatic engine startup.

The original browser Sherpa/WASM voices and editing/flagging/narration controls
remain available with or without CrispASR. The new backend uses the same
per-sentence worker protocol and audio cache.

## Known-working target computer

- Windows x64; Intel Core i5-2400 without AVX2/FMA/F16C/BMI2
- NVIDIA GTX 1650 4 GiB, CUDA 12.6; custom portable-CPU CUDA artifact
- Working native build: [draft PR #7](https://github.com/steveonw/read-aloud-fork/pull/7)
- Confirmed intelligible command-line sample `The storm was coming.`

**Important:** The official CrispASR CUDA executable is **not** compatible
with the user's older CPU. Use only their successfully tested **custom legacy
CPU + CUDA** build at `~/crispasr-gguf-legacy`, not the original
`~/crispasr-gguf` folder.

## 1. Preparing a disposable Read-Aloud test copy

The M4 CI artifact is an **update kit, not a complete USB application**.
It deliberately omits the original multi-megabyte WASM voice engine,
voice packages, Mac/Linux launchers and other assets. Never unzip it over the
only known-working installation.

1. Back up the entire existing working `ReadAloudUSB` folder.
2. Copy the working folder to a separate test directory such as
   `ReadAloudUSB-M4Test` on the same computer.
3. After the M4 CI build is green, download its
   `readaloud-m4-local-bridge-windows` artifact.
4. Extract its `START - WINDOWS.exe` and included `shared/` files into
   **the test copy only**, allowing the six named `shared/` files to be
   replaced. Do **not** delete the other files in `shared/`.
5. Leave the working `~/crispasr-gguf-legacy` folder and downloaded GGUF
   models as they are. The M4 kit carries *no* model weights, CUDA libraries,
   or CrispASR executable.

CI can compile this kit on GitHub, so the user does **not** need to install Go.

## 2. Start native speech service separately (one-time per session)

Open **Git Bash**:

```bash
cd ~/crispasr-gguf-legacy

./crispasr.exe --server --backend cosyvoice3-tts-rl -m auto \
  --voice fleurs-en --i-have-rights \
  --host 127.0.0.1 --port 18080
```

Leave this terminal running. First server startup will load model weights and
may take time on 4 GB VRAM; `-m auto` can download missing weights on
first use. This step runs **only on your computer**; do not add
`--host 0.0.0.0`. Only the local Read-Aloud Go launcher should talk
to that server.

You can verify it from another Git Bash window:

```bash
curl http://127.0.0.1:18080/health
```

Expected a JSON status including `"status":"ok"` and a
`"backend"` name beginning `cosyvoice3-tts`.
If the server is still loading, wait or read its error; do not assume
voice quality from an early `--version` result.

## 3. Enable the optional voice in Read-Aloud

1. Launch the **M4 test copy** with `START - WINDOWS.exe`.
2. Expand **CosyVoice hardware check (optional)**.
3. Check **I have the rights to use the selected CosyVoice preset** if true.
   Do not attest to rights you do not have.
4. Click **Find local CosyVoice GGUF**. If the local native model is ready,
   the **Voice** dropdown gains `CosyVoice 3 GGUF — English (experimental)`.
5. By default, CrispASR continues speaking its AI announcement before every sentence.
6. For film narration, explicitly check **Narration mode** after checking voice rights. By checking it you accept responsibility for disclosing AI-generated speech in your published project. It applies to all new CosyVoice sentences in this browser session and resets when the page closes. Leave it unchecked for the fully spoken disclaimer.
7. Select the English CosyVoice voice, paste **The storm was coming.**, press **F8** and compare both modes. Switching modes partitions the cache, so changed-mode lines must be generated again.
8. Use **Render / Update**, then **Export WAV/MP3** to test. CosyVoice exports include plain AI-generated metadata, but are not C2PA-signed after the browser stitches audio.
9. Confirm original Amy/F8, F7 replay, F9/F10 flags still work. The original USB copy stays untouched.

If the server is absent, the checkbox is unchecked, or model inference fails,
the original portable voices remain selectable. Unchecking rights removes the
experimental voice and returns to a portable voice.

### Capitalization test (native CrispASR / CosyVoice only)

The user requested a simpler capitalization rule. In the experimental
**CosyVoice worker only**, ALL-CAPS words that contain two or more letters
are converted to **first letter uppercase, remainder lowercase** before
being sent to CrispASR for speech. Nothing in the editor is rewritten.
The normal Amy and Lessac voices are **untouched**.

- `HEY!` becomes `Hey!`, `STOP RIGHT THERE!` becomes `Stop Right There!`.
- `FAFAFAFAD` becomes `Fafafafad` (letters are not changed or reordered).
  Unfamiliar invented words still have no guaranteed pronunciation.
- `NASA` becomes `Nasa`, and **undotted** `FBI` becomes `Fbi`.
- To request spoken initials, type periods between letters:
  `F.B.I.`, `U.S.A.`, `A.I.`. These are forwarded unchanged.
- `DON'T` becomes `Don't`, `I'M` becomes `I'm`; existing mixed-case
  words, punctuation and normal sentences are left untouched.

This replaces the earlier experimental list of protected acronyms.
Existing pronunciation-dictionary overrides still apply first.
The transformation is applied only when submitting a CosyVoice native
request; displayed text, highlight positions, labels, and the
Amy/Lessac workers stay exactly as before.

**Live Windows acceptance result:** the user tested this exact phrase in
`read-aloud-narration(4).mp3` after installing the simplified update.
`HEY!` and `STOP RIGHT THERE!` were pronounced as words. The labels
identified `F.B.I. is here.` as one segment, but the initials sounded
approximately like “fee bee eye” rather than clear “eff bee eye”.

**Next optional test (no code change yet):** compare the spoken output
of `F.B.I.`, `F B I`, and `eff bee eye` in the isolated test copy.
Keep the CrispASR Git Bash server running and leave the accepted
uppercase-word workaround and Amy/Lessac unchanged. The MP3 and labels
were uploaded in conversation only, not to this repository.

## 4. Important limitations

- **A separate native terminal is required for now**. Automatic CrispASR
  startup, shutdown and app-bundled engine discovery are future M4 work.
- This version accepts only the tested `fleurs-en` voice, one sentence per
  request, and audio through a fixed loopback `127.0.0.1:18080` HTTP target.
  No arbitrary remote hosts, references or voice paths are accepted.
- **Project-disclosure mode is opt-in.** Default native sentences still include the spoken announcement; a session-only checkbox requests narration-only lines with an attestation. It is never stored in settings.txt or prior sessions.
- **Export provenance limitation:** The browser re-encodes audio to WAV/MP3, so native signed C2PA data is lost. CosyVoice exports carry ordinary `AI_GENERATED` and generator metadata, not signed credentials. The native audio watermark stays ON; still disclose AI speech in the published film. This stage does not enable `--no-watermark` or `--no-c2pa`.
- The bridge validates basic WAV structure; the Web Worker also verifies
  24 kHz mono PCM16 with no gross silence/constant/clipped audio.
- No saved alternate takes / locked audio project manifest yet; the existing
  cache allows unchanged sentence reuse only during the current browser
  session and voice choice, as in the original app.
- Emotional acting instructions supported by the native C++ port have not
  yet been established; **do not claim parity with upstream Python instruct2**.
- GitHub CI uses **mock servers** and no GPU. Actual Go->CrispASR->browser
  audio must still be verified on the user's computer. **Keep PR #9 draft**
  and do not merge until review.

## 5. Security notes

- The Go launcher stays bound to `127.0.0.1`, forwards only fixed
  `/health` and `/v1/audio/speech` requests to `127.0.0.1:18080`,
  requires its per-launch CSRF token for synthesis, and enforces input,
  voice, speed and audio-size limits.
- Native speech requests include an explicit user-selected voice rights
  attestation. Only after Narration Mode is checked does Go send
  `spoken_disclaimer=false` and its fixed marking attestation. If CrispASR does
  not return `X-Crispasr-Spoken-Disclaimer: skipped`, Go rejects the audio.
  Native request fields and upstream URLs cannot be controlled by the browser.
- The browser never talks directly to another origin, and the local
  service does not use Hugging Face paid GPU servers. Model downloads, if
  needed, happen **only at native `-m auto` startup**.
- **No user audio, models or private tokens** are shipped in the test kit.

## References

- [Issue #8 — M4 goal](https://github.com/steveonw/read-aloud-fork/issues/8)
- [PR #9 — M4a bridge (draft)](https://github.com/steveonw/read-aloud-fork/pull/9)
- [Complete handoff](https://github.com/steveonw/read-aloud-fork/blob/m3/gguf-legacy-cuda/docs/HANDOFF_COSYVOICE_GGUF.md)
- [Upstream CrispASR server API](https://github.com/CrispStrobe/CrispASR/blob/v0.8.43/docs/server.md)
