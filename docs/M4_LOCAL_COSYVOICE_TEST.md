# Optional local CosyVoice 3 GGUF voice for Read-Aloud (Windows test)

**Status:** Experimental feature on [draft PR #9](https://github.com/steveonw/read-aloud-fork/pull/9), not merged into the normal Read-Aloud USB release. Short local speech and MP3 export have been tested successfully on the target Windows computer.

This adds an optional **CrispASR / CosyVoice 3 GGUF English voice** to the existing Read-Aloud proofreader. Amy, Lessac, F8 playback and the normal editing interface remain available. There is **no Python/PyTorch requirement**, and speech is generated on your own computer.

## What you need

- A **working Read-Aloud USB folder** to copy for testing. The M4 download is an **update kit, not the full app**.
- A working Windows x64 CrispASR v0.8.43 GGUF executable, its required CUDA files (if using GPU), and local CosyVoice model files. On the tested Intel i5-2400 / GTX 1650, use the **custom legacy-CPU + CUDA build**, not an executable requiring AVX2. See [draft PR #7](https://github.com/steveonw/read-aloud-fork/pull/7).
- The optional [CrispASR Server Control mini-program](../tools/crispasr-server-control/README.md), or Git Bash if you prefer starting the server manually. You do **not** need to build the Go launcher locally; the GitHub test kit contains the Windows launcher.

## 1. Set up a separate test copy

1. Back up your original working `ReadAloudUSB` folder and **leave it unchanged**.
2. Copy it to a folder such as `ReadAloudUSB-M4Test`.
3. On GitHub, open the [M4 Windows test-kit workflow](https://github.com/steveonw/read-aloud-fork/actions/workflows/m4-windows-test-kit.yml), select its **latest successful run on the M4 branch**, and download the `readaloud-m4-local-bridge-windows` artifact.
4. Extract the update into **`ReadAloudUSB-M4Test` only**. Replace `START - WINDOWS.exe` and the six supplied `shared/` files, keeping all other files, voices and WASM assets in the test copy. The kit contains **no GGUF models, CrispASR executable or complete USB distribution**.

The test launcher and original working launcher should **not** be run at the same time. If the launcher's integrity warning reports checksum mismatches after applying the update, treat it as a **separate packaging issue**; do not delete the checksum file or disregard unknown mismatches. The exact older five-file warning has not been fully diagnosed.

## 2. Start CrispASR (mini-program or Git Bash)

**Option A — mini-program, no Git Bash:** [Download CrispASR Server Control for Windows](https://github.com/steveonw/read-aloud-fork/actions/runs/39374421045/artifacts/12243165572). Extract the ZIP and run **CrispASR Server Control.exe**. Select your existing `crispasr.exe` if it is not found automatically, then click **Start server**. It opens a minimized native console for messages, waits for the familiar port `18080`, and lets you click **Stop server** later. You may close the control panel while the server keeps running. Its Stop button is intentionally disabled if another instance was started manually in Git Bash: stop that old instance with Ctrl+C first. [Mini-program details and source](../tools/crispasr-server-control/README.md).

**Option B — manual Git Bash command:** On the tested Windows computer, use the already working `~/crispasr-gguf-legacy` directory:

```bash
cd ~/crispasr-gguf-legacy

./crispasr.exe --server --backend cosyvoice3-tts-rl -m auto \
  --voice fleurs-en --i-have-rights \
  --host 127.0.0.1 --port 18080
```

Wait for:

```text
crispasr-server: listening on 127.0.0.1:18080
```

**If using Git Bash, leave it open** while using Read-Aloud. If using the mini-program, its native server console can remain minimized. Do not restart CrispASR for every sentence. The models are cached and loaded once per server session. `-m auto` may need internet access to obtain missing weights on the first run; it uses cached files thereafter.

Optional status check: open [http://127.0.0.1:18080/health](http://127.0.0.1:18080/health) on the same Windows computer. Keep the server bound to `127.0.0.1`, **not** `0.0.0.0`.

## 3. Start Read-Aloud and use the voice

1. Open `ReadAloudUSB-M4Test/START - WINDOWS.exe`. It starts the Read-Aloud Go server and opens your browser on its local port (commonly `127.0.0.1:17391`).
2. In the **CosyVoice hardware check** section, confirm **I have the rights to use the selected CosyVoice preset** if that is true for your use.
3. Click **Find local CosyVoice GGUF**, then select **CosyVoice 3 GGUF — English (experimental)** from the Voice menu.
4. Paste or type your text, place the cursor, and press **F8** to read aloud. Use the existing **Render / Update**, **Export WAV**, or **Export MP3** controls when you want to save narration.

**Narration mode:** By default, CrispASR includes a spoken AI-generated-audio announcement with each sentence. There is an optional, **off-by-default** Narration Mode checkbox for users who affirm they will disclose AI narration in the published project. It requests speech without repeating that spoken announcement; it is selected **once for the current browser session**, not on every sentence. The native audio watermark remains enabled, and CosyVoice WAV/MP3 exports receive ordinary AI-generated metadata. Those exported files are **not signed C2PA credentials**; disclose AI use appropriately in the finished work.

## Speech text behavior

The experimental **CosyVoice worker only** changes the capitalization of ALL-CAPS words sent for speech. Your written draft and the other voices are **not** changed. Examples:

| Text typed in Read-Aloud | Spoken request sent to CrispASR |
| --- | --- |
| `HEY!` | `Hey!` |
| `STOP RIGHT THERE!` | `Stop Right There!` |
| `FAFAFAFAD` | `Fafafafad` |
| `F.B.I.` | `F.B.I.` |

A short real MP3 confirmed that **HEY** and **STOP RIGHT THERE** are now spoken as words rather than spelled as letters. Pronunciation of unusual acronyms such as `F.B.I.` can still sound unnatural; the current workaround does not guarantee every acronym or invented word will be pronounced correctly.

## Current limitations

- This is a **Windows experimental overlay** for a separately running local CrispASR instance, not an integrated automatic native-engine installer or a normal USB release.
- Short-sentence F8 speech and MP3 exports work on the tested machine. **Long-form stability**, persistent alternative/locked takes and full movie-production workflow still need development.
- The original M4 overlay had a **5-of-37 integrity warning**. Confirm the mismatched files before changing or regenerating checksum manifests.
- Exported audio is processed locally. AI-generated metadata is **not a substitute for signed C2PA provenance** or disclosure in a published project.

## Project links

- [Draft PR #9 — Read-Aloud and local CosyVoice integration](https://github.com/steveonw/read-aloud-fork/pull/9)
- [Issue #8 — features and remaining tasks](https://github.com/steveonw/read-aloud-fork/issues/8)
- [Detailed technical handoff](HANDOFF_M4_COSYVOICE_GGUF.md)
- [CrispASR native server API](https://github.com/CrispStrobe/CrispASR/blob/v0.8.43/docs/server.md)

**Leave the original working Read-Aloud USB copy, native CrispASR binaries, model cache and `main` branch unchanged.**

## Experimental Qwen3-TTS speaker + acting script directions (M4e)

This is **optional** and does not alter the normal Amy / Lessac / Kokoro proofreader. The standalone CrispASR server must be started manually (this controller still starts **CosyVoice** only). First stop CosyVoice on port `18080` if it is running, then start the already downloaded native Qwen model:

```bash
cd ~/crispasr-gguf-legacy
./crispasr.exe --server --backend qwen3-tts-1.7b-customvoice -m auto \
  --voice vivian --host 127.0.0.1 --port 18080
```

Open the **M4 experimental Read-Aloud overlay**, expand **CosyVoice hardware check (optional)** (the shared local-native section), click **Find local Qwen3-TTS GGUF**, and select **Qwen3-TTS 1.7B CustomVoice** in the Voice dropdown. Expand **Script directions — Speaker & Acting** just below the draft editor. Click **Insert Speaker** for one of Qwen's nine preset speakers, or type any acting direction and click **Insert Acting**. These add UTF-8 lines **above the current cursor line** without replacing prose:

```text
⟦speaker=vivian⟧
⟦acting="Terrified, whispering so the killer can't hear"⟧
Don't move. He's outside.
⟦speaker=ryan⟧
I think he saw us!
⟦speaker=vivian⟧
⟦acting="Screaming in horror, then breaking into sobs"⟧
James, no!
⟦acting=auto⟧
She sat in silence.
```

**Speaker and acting are independent and persist** until changed. Only Qwen uses these specific settings; other voices skip valid marker lines. A malformed directive is reported and skipped rather than spoken. A backslash prefix (`\\⟦...`) means literal text, not a directive. **F8 from the middle of the draft inherits directions above it**; F7 and Render / Update still work by sentence and keep their original timings and Audacity labels. Changing a direction changes only affected Qwen sentence cache keys; this test version still uses browser-memory caching and does not promise durable locked takes across restarts.

**Important test limitation:** Vivian (the model started with `--voice vivian`) omits the per-request `voice` field. Other speakers use CrispASR's per-request preset selector. This needs confirmation on the user's exact custom executable; if CrispASR rejects a preset change, Read-Aloud displays an error rather than silently using the wrong voice. The model and native audio watermark remain unchanged; disclose AI narration in finished projects.

This overlay is **not** a full USB installation: apply it only to an isolated copy that already includes the original voice assets. Do not overwrite your working USB copy or merge PR #9 yet.
