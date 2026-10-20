# Optional local CosyVoice 3 GGUF voice for Read-Aloud (Windows test)

**Status:** Experimental feature on [draft PR #9](https://github.com/steveonw/read-aloud-fork/pull/9), not merged into the normal Read-Aloud USB release. Short local speech and MP3 export have been tested successfully on the target Windows computer.

This adds an optional **CrispASR / CosyVoice 3 GGUF English voice** to the existing Read-Aloud proofreader. Amy, Lessac, F8 playback and the normal editing interface remain available. There is **no Python/PyTorch requirement**, and speech is generated on your own computer.

## What you need

- A **working Read-Aloud USB folder** to copy for testing. The M4 download is an **update kit, not the full app**.
- A working Windows x64 CrispASR v0.8.43 GGUF executable, its required CUDA files (if using GPU), and local CosyVoice model files. On the tested Intel i5-2400 / GTX 1650, use the **custom legacy-CPU + CUDA build**, not an executable requiring AVX2. See [draft PR #7](https://github.com/steveonw/read-aloud-fork/pull/7).
- Git Bash for starting CrispASR. You do **not** need to build the Go launcher locally; the GitHub test kit contains the Windows launcher.

## 1. Set up a separate test copy

1. Back up your original working `ReadAloudUSB` folder and **leave it unchanged**.
2. Copy it to a folder such as `ReadAloudUSB-M4Test`.
3. On GitHub, open the [M4 Windows test-kit workflow](https://github.com/steveonw/read-aloud-fork/actions/workflows/m4-windows-test-kit.yml), select its **latest successful run on the M4 branch**, and download the `readaloud-m4-local-bridge-windows` artifact.
4. Extract the update into **`ReadAloudUSB-M4Test` only**. Replace `START - WINDOWS.exe` and the six supplied `shared/` files, keeping all other files, voices and WASM assets in the test copy. The kit contains **no GGUF models, CrispASR executable or complete USB distribution**.

The test launcher and original working launcher should **not** be run at the same time. If the launcher's integrity warning reports checksum mismatches after applying the update, treat it as a **separate packaging issue**; do not delete the checksum file or disregard unknown mismatches. The exact older five-file warning has not been fully diagnosed.

## 2. Start CrispASR once in Git Bash

On the tested Windows computer, use the already working `~/crispasr-gguf-legacy` directory:

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

**Leave Git Bash open** while using Read-Aloud. Do not restart CrispASR for every sentence. The models are cached and loaded once per server session. `-m auto` may need internet access to obtain missing weights on the first run; it uses cached files thereafter.

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
