#!/usr/bin/env python3
"""Local, single-sentence CosyVoice 3 pilot; not a network service.

Uses the *official* CosyVoice AutoModel in an existing Python environment.
No implicit model download, CUDA installation, reference-audio upload, or
Read-Aloud UI integration. One render per process deliberately isolates OOM.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import platform
import sys
import tempfile
import time
import traceback
from typing import Any

MODEL_ID = "FunAudioLLM/Fun-CosyVoice3-0.5B-2512"
PROMPT_PREFIX = "You are a helpful assistant."
PROMPT_END = "<|endofprompt|>"
MAX_TEXT = 600
MAX_REFERENCE_BYTES = 30 * 1024 * 1024


def require_local_model(model_dir: Path) -> list[str]:
    """Do not pass a missing path to AutoModel: it may download silently."""
    missing = []
    if not model_dir.is_dir():
        missing.append("model_directory_missing")
    elif not (model_dir / "cosyvoice3.yaml").is_file():
        missing.append("cosyvoice3_config_missing")
    return missing


def validate_reference(path: Path) -> None:
    if not path.is_file() or path.suffix.lower() != ".wav":
        raise ValueError("reference_wav_missing_or_not_wav")
    size = path.stat().st_size
    if not 44 <= size <= MAX_REFERENCE_BYTES:
        raise ValueError("reference_wav_size_out_of_range")


def prompt_text(transcript: str) -> str:
    clean = " ".join(transcript.strip().split())
    if not clean or len(clean) > 1000:
        raise ValueError("reference_transcript_required")
    if PROMPT_END in clean:
        raise ValueError("reference_transcript_contains_control_tokens")
    return PROMPT_PREFIX + PROMPT_END + clean


def instruction_text(direction: str) -> str:
    clean = " ".join(direction.strip().split())
    if not clean or len(clean) > 500:
        raise ValueError("acting_direction_required")
    if PROMPT_END in clean:
        raise ValueError("direction_contains_control_tokens")
    return PROMPT_PREFIX + " " + clean + PROMPT_END


def input_text(args: argparse.Namespace) -> str:
    if bool(args.text) == bool(args.text_file):
        raise ValueError("supply_either_text_or_text_file")
    if args.text_file:
        text = Path(args.text_file).read_text(encoding="utf-8")
    else:
        text = args.text
    text = " ".join(text.strip().split())
    if not text or len(text) > MAX_TEXT:
        raise ValueError("sentence_required_max_600_chars")
    return text


def sys_info() -> dict[str, Any]:
    return {
        "python": platform.python_version(),
        "os": platform.system(),
        "arch": platform.machine(),
        "model_id": MODEL_ID,
    }


def torch_information(torch: Any) -> dict[str, Any]:
    data: dict[str, Any] = {
        "torch": str(torch.__version__),
        "cuda_available": bool(torch.cuda.is_available()),
    }
    if data["cuda_available"]:
        try:
            name = str(torch.cuda.get_device_name(0))
            props = torch.cuda.get_device_properties(0)
            free, total = torch.cuda.mem_get_info(0)
            data["gpu"] = name
            data["compute_capability"] = "%d.%d" % (props.major, props.minor)
            data["vram_total_bytes"] = int(total)
            data["vram_free_bytes"] = int(free)
        except Exception as exc:
            data["gpu_query_error"] = type(exc).__name__
    return data


def probe(args: argparse.Namespace) -> dict[str, Any]:
    info: dict[str, Any] = {
        "schema": "readaloud-studio/cosyvoice-pilot@0.1",
        "phase": "probe",
        **sys_info(),
        "status": "unavailable",
        "reasons": [],
    }
    model_dir = Path(args.model_dir).expanduser()
    repo_dir = Path(args.cosyvoice_repo).expanduser()
    info["model_found"] = not bool(require_local_model(model_dir))
    info["repo_found"] = (repo_dir / "cosyvoice" / "cli" / "cosyvoice.py").is_file()
    if not info["model_found"]:
        info["reasons"].extend(require_local_model(model_dir))
    if not info["repo_found"]:
        info["reasons"].append("cosyvoice_source_missing")
    try:
        import torch
        info.update(torch_information(torch))
    except Exception as exc:
        info["reasons"].append("torch_import_failed")
        info["torch_error"] = type(exc).__name__
    if info["reasons"]:
        return info
    if args.device == "cuda" and not info.get("cuda_available"):
        info["reasons"].append("cuda_not_available")
        return info
    if args.device == "cpu":
        info["status"] = "warning"
        info["reasons"].append("cpu_inference_unbenchmarked")
    elif not info.get("cuda_available"):
        info["status"] = "warning"
        info["reasons"].append("no_cuda_cpu_fallback_unbenchmarked")
    else:
        info["status"] = "warning"
        info["reasons"].append("full_model_vram_peak_unmeasured")
    return info


def verify_render_args(args: argparse.Namespace) -> tuple[str, Path, Path]:
    text = input_text(args)
    if not args.reference_wav:
        raise ValueError("reference_wav_required")
    wav = Path(args.reference_wav).expanduser().resolve()
    validate_reference(wav)
    if args.direction:
        instruction_text(args.direction)
    else:
        prompt_text(args.reference_text or "")
    if not (0.7 <= args.speed <= 1.3):
        raise ValueError("speed_out_of_range")
    output = Path(args.output_wav).expanduser().resolve()
    if output.exists() and not args.overwrite:
        raise ValueError("output_exists_use_another_take_name")
    if output.suffix.lower() != ".wav":
        raise ValueError("output_requires_wav_extension")
    return text, wav, output


def import_official_model(repo_dir: Path) -> Any:
    """Use checked-out official source, not an unofficial pip proxy."""
    path = repo_dir.resolve()
    if not (path / "cosyvoice" / "cli" / "cosyvoice.py").is_file():
        raise ValueError("cosyvoice_source_missing")
    sys.path.insert(0, str(path / "third_party" / "Matcha-TTS"))
    sys.path.insert(0, str(path))
    from cosyvoice.cli.cosyvoice import AutoModel
    return AutoModel


def memory_snapshot(torch: Any) -> dict[str, int]:
    if not torch.cuda.is_available():
        return {}
    gpu: dict[str, int] = {}
    try:
        free, total = torch.cuda.mem_get_info(0)
        gpu["vram_free_bytes"] = int(free)
        gpu["vram_total_bytes"] = int(total)
        gpu["cuda_peak_allocated_bytes"] = int(torch.cuda.max_memory_allocated(0))
        gpu["cuda_peak_reserved_bytes"] = int(torch.cuda.max_memory_reserved(0))
    except Exception:
        pass
    return gpu


def diagnostic_stage(args: argparse.Namespace, message: str) -> None:
    """Show safe progress markers only when the user explicitly requests diagnostics."""
    if getattr(args, "debug", False):
        print("[cosyvoice-pilot] " + message, file=sys.stderr, flush=True)


def render(args: argparse.Namespace) -> dict[str, Any]:
    diagnostic_stage(args, "validating local model, output and reference WAV")
    text, reference_wav, dest = verify_render_args(args)
    model_dir = Path(args.model_dir).expanduser().resolve()
    repo_dir = Path(args.cosyvoice_repo).expanduser().resolve()
    if require_local_model(model_dir):
        raise ValueError(",".join(require_local_model(model_dir)))
    if not (repo_dir / "cosyvoice" / "cli" / "cosyvoice.py").is_file():
        raise ValueError("cosyvoice_source_missing")
    if not args.try_anyway:
        raise ValueError("full_model_memory_unmeasured_pass_try_anyway")

    # Must be set before importing torch or the upstream model.
    if args.device == "cpu":
        os.environ["CUDA_VISIBLE_DEVICES"] = "-1"

    diagnostic_stage(args, "importing Torch and SoundFile")
    import torch
    import soundfile as sf

    if args.device == "cuda" and not torch.cuda.is_available():
        raise ValueError("cuda_not_available")
    using_cuda = bool(torch.cuda.is_available())
    if using_cuda:
        torch.cuda.reset_peak_memory_stats(0)
    starting = torch_information(torch)
    started_at = time.monotonic()
    diagnostic_stage(args, "importing official CosyVoice AutoModel")
    AutoModel = import_official_model(repo_dir)

    # The entire model (LLM + flow + vocoder + frontend) loads here.
    # Only explicit fp16 is used; no unverified/off-label quantization.
    diagnostic_stage(args, "loading complete CosyVoice3 model (GPU allocation may fail)")
    model = AutoModel(model_dir=str(model_dir), fp16=bool(args.fp16 and using_cuda))
    loaded_seconds = time.monotonic() - started_at
    diagnostic_stage(args, "model loaded; starting speech inference")
    inference_start = time.monotonic()
    if args.direction:
        audio_parts = model.inference_instruct2(
            text, instruction_text(args.direction), str(reference_wav),
            stream=False, speed=args.speed)
        mode = "instruct2"
    else:
        audio_parts = model.inference_zero_shot(
            text, prompt_text(args.reference_text), str(reference_wav),
            stream=False, speed=args.speed)
        mode = "zero_shot"

    diagnostic_stage(args, "iterating over generated PCM chunks")
    chunks = []
    for part in audio_parts:
        wave = part.get("tts_speech")
        if wave is None:
            raise RuntimeError("upstream_missing_tts_speech")
        chunks.append(wave.detach().cpu().reshape(-1))
    if not chunks:
        raise RuntimeError("upstream_returned_no_audio")
    audio = torch.cat(chunks).numpy()
    if len(audio) < 100:
        raise RuntimeError("upstream_returned_empty_audio")
    sample_rate = int(model.sample_rate)
    if sample_rate < 8000 or sample_rate > 192000:
        raise RuntimeError("upstream_invalid_sample_rate")

    diagnostic_stage(args, "writing result to a temporary WAV then publishing atomically")
    # Atomic publish; failed or OOM calls never overwrite an accepted take.
    dest.parent.mkdir(parents=True, exist_ok=True)
    fd, partial_name = tempfile.mkstemp(prefix=".cosyvoice-pilot-", suffix=".wav", dir=dest.parent)
    os.close(fd)
    try:
        sf.write(partial_name, audio, sample_rate, format="WAV", subtype="PCM_16")
        os.replace(partial_name, dest)
    finally:
        if os.path.exists(partial_name):
            os.unlink(partial_name)

    return {
        "schema": "readaloud-studio/cosyvoice-pilot@0.1",
        "phase": "render",
        "status": "success",
        "mode": mode,
        "model_id": MODEL_ID,
        "device": "cuda" if using_cuda else "cpu",
        "fp16": bool(args.fp16 and using_cuda),
        "sample_rate": sample_rate,
        "sample_count": int(len(audio)),
        "duration_seconds": round(len(audio) / sample_rate, 3),
        "load_seconds": round(loaded_seconds, 3),
        "render_seconds": round(time.monotonic() - inference_start, 3),
        "output_wav": str(dest),
        "torch": str(torch.__version__),
        "device_before_load": starting,
        "device_after_render": memory_snapshot(torch),
    }


def build_parser() -> argparse.ArgumentParser:
    parent = argparse.ArgumentParser(add_help=False)
    parent.add_argument("--cosyvoice-repo", required=True, help="Local official CosyVoice source checkout")
    parent.add_argument("--model-dir", required=True, help="Downloaded model directory (cosyvoice3.yaml required)")
    parent.add_argument("--device", choices=["auto", "cuda", "cpu"], default="auto")
    parser = argparse.ArgumentParser(description="One-sentence native CosyVoice pilot (no server)")
    subs = parser.add_subparsers(dest="command", required=True)
    subs.add_parser("probe", parents=[parent], help="Report dependencies and CUDA without loading a model")
    render_cmd = subs.add_parser("render", parents=[parent], help="Create one local WAV with the official model")
    text = render_cmd.add_mutually_exclusive_group(required=True)
    text.add_argument("--text")
    text.add_argument("--text-file", help="UTF-8 text file for Unicode-safe Windows scripts")
    render_cmd.add_argument("--reference-wav", required=True, help="Your licensed reference audio")
    render_cmd.add_argument("--reference-text", default="", help="Exact words spoken in the reference WAV")
    render_cmd.add_argument("--direction", default="", help="Optional acting direction for instruct2 mode")
    render_cmd.add_argument("--speed", type=float, default=1.0)
    render_cmd.add_argument("--output-wav", required=True)
    render_cmd.add_argument("--fp16", action="store_true", help="Try upstream fp16, not guaranteed to fit 4GB")
    render_cmd.add_argument("--try-anyway", action="store_true", help="Acknowledge unknown model memory peak")
    render_cmd.add_argument("--overwrite", action="store_true", help="Replace output if already present")
    render_cmd.add_argument("--debug", action="store_true",
                            help="Print stages and full traceback to stderr; local file paths may appear")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    start = time.monotonic()
    try:
        if args.command == "probe":
            info = probe(args)
            code = 0
        else:
            info = render(args)
            code = 0
    except Exception as exc:
        error_message = str(exc).strip()
        reason = error_message[:300] if isinstance(exc, ValueError) else type(exc).__name__
        if "out of memory" in error_message.lower() or "OutOfMemory" in type(exc).__name__:
            reason = "cuda_out_of_memory"
        info = {
            "schema": "readaloud-studio/cosyvoice-pilot@0.1",
            "phase": args.command,
            "status": "error",
            "reason": reason,
            "exception_type": type(exc).__name__,
            "seconds_elapsed": round(time.monotonic() - start, 3),
        }
        if error_message:
            info["error_message"] = error_message[:600]
        if getattr(args, "debug", False):
            # Only explicit local diagnostics print a stack trace, because a
            # traceback can include model/reference paths or text snippets.
            traceback.print_exc(file=sys.stderr)
        code = 2
    print(json.dumps(info, ensure_ascii=False, sort_keys=True), flush=True)
    return code


if __name__ == "__main__":
    sys.exit(main())
