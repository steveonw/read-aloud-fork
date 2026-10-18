# M2a — Windows GPU discovery (diagnostic-only)

**Status:** First reviewable slice of [M2 issue #4](https://github.com/steveonw/read-aloud-fork/issues/4).  
**Windows pilot system:** GTX 1650 (4 GB VRAM), 20 GB system RAM.  
**CosyVoice native inference:** **not installed and not implemented yet**.

## Purpose

The USB Read-Aloud proofreader must remain useful on a computer without NVIDIA, CUDA, Python, or a CosyVoice model. This change adds optional, **read-only local** hardware discovery. It **does not** detect model compatibility or make native synthesis selectable.

- UI: optional collapsed `CosyVoice hardware check` with a `Check local GPU` button.
- API: `GET /api/tts/capabilities`, read-only and loopback Host-guarded; model/user text is never transmitted.
- Probe: ask the existing NVIDIA driver utility `nvidia-smi` for GPU name, driver, and total/free VRAM, with a 2.5-second subprocess timeout. On Windows, probe PATH, Program Files NVIDIA NVSMI, and System32 standard locations.
- No GPU found versus no driver utility found are distinct. If the tool is absent or broken, show **unknown**, never falsely claim there is no GPU.
- Report native `cosyvoice3-local` as **unavailable**, reason `native_backend_not_installed`. The existing portable `sherpa-wasm` voices remain the default.
- The browser performs no automatic probe: it runs only when the button is clicked and cancels after seven seconds.

## GPU preflight states

| State | Reason | Meaning |
| --- | --- | --- |
| `detected` | `gpu_detected_memory_unverified` | A driver-reported NVIDIA GPU is present, but CosyVoice fitness is unknown |
| `unknown` | `gpu_probe_unavailable` | Driver utility not found; does not prove no GPU |
| `unknown` | `gpu_probe_failed` / `gpu_probe_timeout` | Utility failed or timed out |
| `unknown` | `gpu_probe_invalid_output` | Utility returned malformed data |
| `unavailable` | `no_nvidia_device_reported` | Utility ran and reported zero GPUs |

VRAM is an instantaneous snapshot, not a promised usable CosyVoice memory budget. Missing total/free values remain unknown instead of fabricated.

### Example JSON (illustrative; not a measurement)

~~~json
{
  "schema": "readaloud-studio/tts-capabilities@0.1",
  "platform": "windows",
  "arch": "amd64",
  "gpu": {
    "state": "detected",
    "reason": "gpu_detected_memory_unverified",
    "devices": [
      {"name": "NVIDIA GeForce GTX 1650", "driver": "example-only", "vramTotalMiB": 4096, "vramFreeMiB": 2950}
    ]
  },
  "backends": [
    {"id": "sherpa-wasm", "state": "ready", "canTry": true},
    {"id": "cosyvoice3-local", "state": "unavailable", "reason": "native_backend_not_installed", "canTry": false}
  ]
}
~~~

## Verification

- Go unit tests check robust parsing, missing metadata, malformed CSV, no GPU, failed probe, loopback Host restriction and GET-only method.
- CI cross-builds the launcher for Windows amd64.
- Browser-UI tests exercise opted-in checks, error handling and text-only display; no GPU data is inserted as HTML.
- Existing Read-Aloud, adapter and stress tests remain unchanged in intent. Full USB/Chromium validation must still pass with the diagnostics component included.
- No shell interpreter, user-supplied executable, model install or remote/cloud endpoint is involved.

## Windows test after a green build

1. Download the test USB ZIP from the M2a GitHub Actions run and extract it. This is **not** a CosyVoice edition.
2. Start the Windows launcher. Confirm normal proofreading still works.
3. Expand `CosyVoice hardware check`, select `Check local GPU`, and see whether the GTX 1650 and its 4 GB VRAM are recognized.
4. A report of `CosyVoice native backend not installed` is **expected**. If no GPU is reported, do not assume the card is incompatible; it may be a driver-tool availability problem.

## Next M2 work

Install an optional native CosyVoice worker lazily, add an actual model/runtime preflight, preserve one-job-at-a-time inference and recover from CUDA out-of-memory. Benchmark **complete** CosyVoice 3 synthesis on the GTX 1650/20 GB RAM host before offering Ready/Try Anyway or recommending CPU offload or quantization. The lightweight WASM proofreading mode remains available throughout.
