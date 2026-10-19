# Experimental Windows CUDA 12.6 build for legacy Intel CPUs

This is a **separate experiment** from the native Python CosyVoice3 pilot in PR #6 and from the portable Read-Aloud app. It does not change the proofreader or install anything on a user's computer.

## Why

A Windows user with an **Intel Core i5-2400 (Sandy Bridge, no AVX2/FMA/F16C/BMI2)** and NVIDIA **GTX 1650 4 GiB (CUDA sm_75)** installed CrispASR v0.8.43's official `crispasr-windows-x86_64-cuda126.zip`. `--version` succeeded, but `--backend cosyvoice3-tts-rl` refused to start because the prebuilt CUDA executable required newer x64 CPU instructions. **The CosyVoice3 GGUF model has not yet been downloaded or tested.**

CrispASR upstream has `CRISPASR_PORTABLE_CPU=ON` for an SSE2-friendly CPU floor. Their official **CPU-only** `crispasr-windows-x86_64-cpu-legacy.zip` is not a substitute for a CUDA-accelerated build. This workflow compiles **both** portable CPU helpers and a CUDA 12.6 backend with just sm_75 to reduce build time. The upstream source is pinned to **CrispStrobe/CrispASR v0.8.43, commit `eb633d908120cc5f44b8af8cd4aeb1191f16bfd8`**.

## Build (GitHub Actions, not the user's PC)

On the branch `m3/gguf-legacy-cuda`, visit **Actions > Build CrispASR legacy CPU + CUDA 12.6**. The workflow runs on a Windows 2022 hosted GitHub runner when its YAML is pushed and can also be dispatched manually once GitHub displays it.

If the run is green, open the **Artifacts** section of that run and download:

`crispasr-legacy-cpu-gtx1650-cuda126`

GitHub automatically provides a ZIP of the output folder. The artifact contains `crispasr.exe`, all built CrispASR DLLs, matched CUDA 12.6 runtime DLLs and upstream license/third-party notices. It contains **no model weights, secrets, user voice samples or recordings**.

The workflow checks:
- CMake's `CRISPASR_PORTABLE_CPU=ON` and `GGML_CUDA=ON`;
- `GGML_AVX`, `GGML_AVX2`, `GGML_FMA`, `GGML_F16C` and `GGML_BMI2` are **OFF**;
- the packaged executable can print `--version` with both CPU and CUDA backends on GitHub's driverless Windows runner, showing CUDA 12.6;
- the built-in `cosyvoice3-tts-rl` backend is present via `--list-backends`.

**Limitation:** GitHub-hosted Windows CI cannot prove the binary starts on an *actual* i5-2400 or that the GTX 1650 has enough VRAM to synthesize good speech. The user's first safe check is `--version` on the intended computer, followed by an optional single short GGUF synthesis if this succeeds. Treat the package as **experimental, not a production release**.

## Safe installation and first on-machine check

Do **not** overwrite `C:\Users\steveon\crispasr-gguf\`, delete the previous Python CosyVoice files, or merge experimental work into Read-Aloud.

1. Unzip the CI artifact into a **new directory**, for example `C:\Users\steveon\crispasr-gguf-legacy\`. Put the EXE and its DLLs in the same directory, preserving all files. A signed official installer is not provided.
2. Open Git Bash and run:

   ```bash
   cd ~/crispasr-gguf-legacy
   ./crispasr.exe --version
   ```

3. Confirm `--version` identifies the new build with CPU and CUDA. **Important:** CrispASR exits early for `--version` and `--list-backends`, *before* its real CPU-ISA startup check (the original incompatible package also passed `--version`). For a model-free check that reaches the guard, run:

   ```bash
   ./crispasr.exe --backend cosyvoice3-tts-rl -m ./THIS_FILE_DOES_NOT_EXIST.gguf \
     --voice fleurs-en --i-have-rights \
     --tts "Test." --tts-output ./not-created.wav
   ```

   A **missing model** error is expected and means startup got past the CPU check; an **AVX2/FMA/F16C/BMI2** error means compatibility is not solved. Do not bypass the guard with `CRISPASR_IGNORE_CPU_ISA=1`, and do not interpret this probe as actual model inference success.
4. **Only after the real startup check passes**, an opt-in first speech test could be:

   ```bash
   ./crispasr.exe --backend cosyvoice3-tts-rl -m auto \
     --voice fleurs-en --i-have-rights \
     --tts "The storm was coming." --tts-output gguf-first-test.wav
   ```

   This downloads GGUF model components from Hugging Face on first use; it does not reuse the original 9 GiB Python/PyTorch checkpoint directly. Keep the existing native audio-integrity checks and do not conclude that 4 GiB VRAM is adequate from model file sizes alone. Stop if GPU memory pressure or corrupted audio occurs.

## Cleanup is separate

Only after an intelligible GGUF WAV has been listened to and accepted, back up any useful files and remove the **old, dedicated** Python CosyVoice folders (`~/cosyvoice-pilot/CosyVoice` and `~/cosyvoice-pilot/.venv`) if the user still wants to. Preserve `~/cosyvoice-pilot/ReadAloudForkPilot`, project WAV files, the portable Read-Aloud app, and global Python versions. No cleanup should happen automatically.

This draft workflow is not an upstream CrispASR release and does not claim CosyVoice3 GGUF preserves upstream expressive `instruct2` direction controls. Confirm model quality and feature parity before integration into the narration studio.
