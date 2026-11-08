# CrispASR Server Control — Windows model picker (M4 experimental)

This is a small, separate Windows GUI for starting the existing local CrispASR speech server for **CosyVoice 3** or **Qwen3-TTS 1.7B CustomVoice**. It is built from `Program.cs` by the [Windows controller workflow](https://github.com/steveonw/read-aloud-fork/actions/workflows/m4-crispasr-server-control.yml).

It does **not** contain, install, rebuild, modify, or delete CrispASR, CUDA DLLs, GGUF models, or Read-Aloud. Use your existing working custom `crispasr.exe` on the older i5-2400 / GTX 1650, not an incompatible stock AVX2 build. Work from an isolated M4 Read-Aloud test copy.

## Start a local model

1. Download the controller artifact from a successful M4 branch workflow run, extract it, and double-click **CrispASR Server Control.exe**.
2. Under **Location**, browse to your *already working* `crispasr.exe`. Keep matching CUDA/runtime DLLs next to the executable.
3. Select **CosyVoice 3 GGUF — English** or **Qwen3-TTS 1.7B CustomVoice** from **Speech engine**.
4. **Simplest / already-cached model:** Leave the model and codec boxes blank. The controller uses the previously tested `-m auto` command. **Warning: if the model is not already cached, CrispASR's `auto` mode may download missing GGUF assets.** The controller itself never downloads anything.
5. **Choose local model files instead:** Click **Find model...** and select an existing `.gguf`. For Qwen, also choose its compatible `qwen3-tts-tokenizer-12hz.gguf` codec; the app looks beside the selected talker for that filename. If no sibling codec is found, select one explicitly. The model and codec must match the engine. The controller validates existence/extension but cannot certify GGUF format, compatibility or complete model-family dependencies.
6. For CosyVoice, confirm **I have rights to use the CosyVoice voice preset**, if true. For Qwen, the startup preset remains **Vivian**; other Qwen speakers and acting directions remain available through Read-Aloud script markers.
7. Click **Start server** and allow model loading. Look for **Running — cosyvoice3-tts-rl** or **Running — qwen3-tts-1.7b-customvoice**. If starting fails, read the minimized native CrispASR console. In Read-Aloud, use **Find local CosyVoice GGUF** or **Find local Qwen3-TTS GGUF**, then select that voice and press **F8**.

Both engines use fixed `127.0.0.1:18080`. **Only one engine may occupy that port at a time**. To switch engines, stop the server started by this controller and then start the other. If an existing server was started manually in Git Bash, the controller reports **Running externally** and refuses to kill or replace it; stop that process in its own console first.

### Exact launch profiles

**CosyVoice 3, cached/default:** 
```text
--server --backend cosyvoice3-tts-rl -m auto --voice fleurs-en --i-have-rights --host 127.0.0.1 --port 18080
```

**Qwen3-TTS 1.7B CustomVoice, cached/default:**
```text
--server --backend qwen3-tts-1.7b-customvoice -m auto --voice vivian --host 127.0.0.1 --port 18080
```

For a selected existing file, the controller replaces `-m auto` with `-m "C:\path\model.gguf"`. For Qwen with an explicit codec, it adds `--codec-model "C:\path\qwen3-tts-tokenizer-12hz.gguf"`. The paths are passed as quoted arguments directly to CrispASR, **not through a command shell**.

**CosyVoice caution:** the CosyVoice3 GGUF backend can require multiple companion weights (LLM, flow, vocoder and other components) rather than one self-contained file. Browsing just a random CosyVoice `.gguf` cannot assemble a complete package. On the tested computer, **`-m auto` with the existing cached weights is the proven path**; do not replace or shuffle the user's model cache. If you select an explicit CosyVoice model, check the native console for additional required companion files.

## Preferences and safety

- The engine and selected file paths are saved under `%LOCALAPPDATA%\ReadAloudCrispASRControl`. Voice-rights consent is **not saved**; it must be checked again when using CosyVoice.
- The controller owns only the exact process it launched, verified by PID, process start time and executable path; it will not terminate another application's process. Closing the GUI leaves its managed process running. Reopen the GUI to stop it.
- **Stop server** prompts for confirmation and can interrupt speech generation. Do not run both large speech models concurrently on the GTX 1650's 4 GB VRAM.
- No arbitrary server host/port, command flags, cloud endpoint, auto-disabling watermark, or automatic AI-disclosure waiver is offered.
- The separate Read-Aloud Go launcher remains the only browser-facing app bridge. This controller starts the **native** server, which Read-Aloud discovers via its existing fixed-loopback status checks. Nothing has been added to browser JavaScript to execute local programs directly.
- AI-generated audio provenance/disclosure requirements continue to apply. This utility does not remove native audio watermarks or signed/unsigned provenance limitations.

## Technical verification

The GitHub Actions Windows workflow compiles this .NET Framework WinForms source and runs its `--self-test` command, checking fixed backend/voice/loopback arguments, selected-model path quoting and health parsing. This is **not** a real GGUF synthesis or GPU acceptance test. After downloading the compiled artifact, perform a manual test on the Windows machine with the existing CrispASR binary and model files.
