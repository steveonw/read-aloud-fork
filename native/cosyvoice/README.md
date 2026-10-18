# M2b — CosyVoice 3 first-sentence pilot (Windows)

**Status: experimental, opt-in, stand-alone Python CLI.** This is an inference experiment, **not yet an installed voice in Read-Aloud**. The existing portable Read-Aloud F8 proofreader does **not** require Python, CUDA, or CosyVoice.

Target machine for the first real run: Windows, NVIDIA GTX 1650 (4 GB VRAM), 20 GB system RAM. **CosyVoice 3 is not confirmed to run within 4 GB of VRAM**. An out-of-memory result is useful measurement, not a bug in the portable proofreader.

The tested upstream source is [FunAudioLLM/CosyVoice](https://github.com/FunAudioLLM/CosyVoice) (also reachable at [QwenAudio/CosyVoice](https://github.com/QwenAudio/CosyVoice)). Use the **Fun-CosyVoice3-0.5B-2512** model, not CosyVoice2. The model and upstream source report Apache-2.0 licenses; review your voice reference's consent and license separately.

## Requirements / safety

- A **separate Python 3.10 environment** and a local checkout of the official CosyVoice source with submodules. The project does not install or modify Python globally.
- Download model files independently to a local folder containing `cosyvoice3.yaml`. The pilot never downloads a missing model: it explicitly refuses to start.
- A **WAV recording you own or have permission to use**, ideally a clean short spoken passage. Zero-shot inference also needs the *exact transcript of that passage*.
- The test invokes only the local official `AutoModel` with `inference_zero_shot` or `inference_instruct2`. Nothing runs as a remote server or uploads scripts/voice files.
- It generates only **one sentence** and writes a WAV atomically; existing output files are preserved unless `--overwrite` is explicitly supplied.
- Memory usage and runtime are recorded in JSON printed to the console. Errors include the safe category (e.g. `cuda_out_of_memory`), not the voice recording.

## One-time environment setup (manual; not required for normal proofreading)

Open **Anaconda Prompt** after installing Miniconda, then run:

~~~powershell
conda create -n cosyvoice-pilot -y python=3.10
conda activate cosyvoice-pilot
git clone --recursive https://github.com/FunAudioLLM/CosyVoice.git
cd CosyVoice
git submodule update --init --recursive
pip install -r requirements.txt
~~~

The **upstream Windows dependency stack can be finicky**, and the pinned PyTorch/CUDA wheels may need platform-specific attention. If this step fails, **do not uninstall the original portable app or modify a working global Python environment**. Record the exact error and package versions. This pilot has *not* been tested on the user's NVIDIA driver.

Download the model in this environment into a dedicated folder (several GB, suitable free disk space required):

~~~powershell
python -c "from huggingface_hub import snapshot_download; snapshot_download(repo_id='FunAudioLLM/Fun-CosyVoice3-0.5B-2512', local_dir='C:\CosyVoiceModels\Fun-CosyVoice3-0.5B')"
~~~

If needed, first install `huggingface_hub` in the isolated environment. Avoid claiming model files can fit onto every USB drive. The model is **not** checked into the Read-Aloud fork.

## Probe: no model import or synthesis

From the downloaded Read-Aloud fork source checkout, with the pilot environment active:

~~~powershell
python native\cosyvoice\pilot.py probe --cosyvoice-repo "C:\path\to\CosyVoice" --model-dir "C:\CosyVoiceModels\Fun-CosyVoice3-0.5B" --device cuda
~~~

Expected shape (values illustrative):

~~~json
{"schema":"readaloud-studio/cosyvoice-pilot@0.1","phase":"probe","status":"warning","reasons":["full_model_vram_peak_unmeasured"],"gpu":"NVIDIA GeForce GTX 1650","vram_free_bytes":2500000000}
~~~

`warning` is correct before actual inference even if CUDA is available. `unavailable` with `torch_import_failed` or `cuda_not_available` means the environment needs diagnosis before running an inference attempt.

## Render a candidate WAV

Make a file `my-voice.wav` using a voice you are authorized to use; note **the exact words spoken** in that WAV. The example transcript below is just a placeholder and must be changed to your own real transcript.

~~~powershell
python native\cosyvoice\pilot.py render --cosyvoice-repo "C:\path\to\CosyVoice" --model-dir "C:\CosyVoiceModels\Fun-CosyVoice3-0.5B" --device cuda --text "Each frame took fourteen hours." --reference-wav "C:\path\to\my-voice.wav" --reference-text "Replace this with the exact words spoken in my voice WAV." --output-wav "C:\CosyVoiceTakes\sentence-001.wav" --try-anyway
~~~

An optional experimental `--fp16` flag follows upstream's native option, but **does not guarantee fitting 4 GB**. `--try-anyway` is deliberate: the first full-pipeline peak is unmeasured. If it runs out of memory, the process exits with a structured error and does not publish a broken WAV; normal Read-Aloud voices are unaffected.

For a directed performance test, replace `--reference-text` with:

~~~powershell
--direction "Speak like a restrained documentary narrator, with contained dread."
~~~

This calls official `inference_instruct2`. Whether the direction changes the emotion convincingly must be judged by listening; **there is no promise of deterministic acting control**.

If the GPU repeatedly runs out of memory, you may test `--device cpu --try-anyway` in a fresh process, but CPU generation may be extremely slow and 20 GB RAM does not guarantee success. Do not install unverified quantized builds or modify CUDA libraries until we know the actual failure mode.

## Diagnosing a generic RuntimeError on Windows

Early pilot versions returned only `"reason": "RuntimeError"`. This can come from a native DLL/runtime issue, a model-loading failure, or an inference error; **it is not enough to infer CUDA out of memory**. A user with Windows 10 / GTX 1650 first reported this exact result after ~3 seconds.

After updating your M2b pilot checkout with `git pull --ff-only`, pass `--debug` to a **single** run:

~~~bash
cd ~/cosyvoice-pilot/ReadAloudForkPilot
git pull --ff-only
cd ../CosyVoice
python ../ReadAloudForkPilot/native/cosyvoice/pilot.py render \
  --cosyvoice-repo . \
  --model-dir pretrained_models/Fun-CosyVoice3-0.5B \
  --device cuda \
  --text "The storm was coming." \
  --reference-wav asset/zero_shot_prompt.wav \
  --direction "Speak like a calm documentary narrator." \
  --output-wav ../cosyvoice-first-test.wav \
  --fp16 --try-anyway --debug 2> ../cosyvoice-pilot-debug.log
tail -n 35 ../cosyvoice-pilot-debug.log
~~~

The JSON output includes the exception type and the first 600 characters of its message; `--debug` additionally records **stage markers and a real Python traceback** in a local text file. These diagnostics may contain local user paths; remove personal paths, tokens or reference filenames before pasting elsewhere. No audio, script text or traceback is uploaded automatically. **Do not repeatedly retry GPU inference** after a failure. Inspect the real reason first and decide whether the fix is a missing Windows runtime dependency, CUDA issue or actual GPU memory pressure.

## Audio integrity check: first Windows WAV was **not** speech

The first real GTX 1650 render returned `status: success` and saved a 24 kHz, 1.36-second WAV, but user-provided audio inspection found **32,640 identical mono samples at -1.0** (every PCM16 sample was `-32768`). That is a flat-line, saturated waveform, **not narration**. The initial pilot treated "received PCM of sufficient length" as success; the log did not check numeric validity of samples.

Current M2b pilot now checks the **raw floating-point samples before SoundFile's PCM16 conversion** and rejects:
- NaN or infinite samples (`generated_audio_nonfinite`)
- silence, constant waveforms, or excessive full-scale clipping (`generated_audio_silent`, `generated_audio_constant`, `generated_audio_clipped`)

An invalid waveform exits nonzero, returns structured `audio_diagnostics` (sample count, min/max, peak, RMS, clipping and non-finite counts), and **does not publish a WAV**. Validation helps identify the symptoms but **does not establish** whether the failure originated from fp16 numerical issues, GPU oversubscription, a missing CPU/GPU ONNX provider, frontend normalization, or elsewhere. The logs previously noted no CUDA ONNX ExecutionProvider and an optional WeText/ModelScope 403; those are leads, not a proven cause.

Do not interpret `status: success` from pilot versions before this fix as usable speech. Since the initial `--fp16` full-model attempt consumed or oversubscribed the card's 4 GiB VRAM and produced invalid audio, **avoid repeated GPU attempts or switching to fp32 on the same device without separate capacity planning**. Preserve existing WAVs for debugging; the updated pilot won't overwrite them unless `--overwrite` is specified.

## Record the result

A successful WAV result prints `sample_rate`, `sample_count`, `load_seconds`, `render_seconds`, `torch`, and CUDA peak allocated/reserved bytes when available. Paste the JSON with sensitive file paths removed into [M2 issue #4](https://github.com/steveonw/read-aloud-fork/issues/4) or a PR comment. If the actual GPU test fails, record the reason code and package/driver versions; the failure is useful for determining whether CPU offloading or a remote server should be preferred.

This pilot is **one shot per process**, intentionally. Future M2c work adds an authenticated local Go bridge, a persistent one-job-at-a-time Python worker, in-app voice/reference selection, and recovery to the existing WASM backend. We should not add those moving parts until the official runtime can generate at least one truthful, measured sample on a supported host.

## Developer tests (no torch or model needed)

~~~powershell
python -m unittest discover -s native\cosyvoice -p "test_*.py" -v
~~~

The tests use a **fake** official model. They verify prompt formatting, input validation, one-sentence response metadata, and preservation of accepted output on errors; they are **not** a substitute for real Windows GPU inference.

## Provenance

- Official API: [example.py](https://github.com/FunAudioLLM/CosyVoice/blob/main/example.py), including the CosyVoice3 `inference_zero_shot` and `inference_instruct2` calls and the required `<|endofprompt|>` delimiter.
- Installation: [CosyVoice README](https://github.com/FunAudioLLM/CosyVoice/blob/main/README.md).
- Model: [Fun-CosyVoice3-0.5B-2512](https://huggingface.co/FunAudioLLM/Fun-CosyVoice3-0.5B-2512).
