"""Pure-stdlib contract tests for the optional one-sentence CosyVoice pilot.

No torch, CUDA, model weights, network, or actual speaker/reference audio needed.
"""
import argparse
from contextlib import redirect_stdout, redirect_stderr
import io
import json
import math
import pathlib
from tempfile import TemporaryDirectory
import types
import unittest
from unittest import mock

import pilot


class FakeArray:
    def __init__(self, values):
        self.values = list(values)
        self.shape = (len(self.values),)

    def numpy(self):
        return self.values


class FakeWave:
    def __init__(self, values):
        self.values = values

    def detach(self):
        return self

    def cpu(self):
        return self

    def reshape(self, _):
        return FakeArray(self.values)


class FakeCuda:
    def __init__(self, available=True):
        self.available = available
        self.reset_called = False

    def is_available(self):
        return self.available

    def reset_peak_memory_stats(self, _):
        self.reset_called = True
        raise RuntimeError("Invalid device argument")

    def get_device_name(self, _):
        return "Mock GTX 1650"

    def get_device_properties(self, _):
        return types.SimpleNamespace(major=7, minor=5)

    def mem_get_info(self, _):
        return (2_000_000_000, 4_000_000_000)

    def max_memory_allocated(self, _):
        return 3_100_000_000

    def max_memory_reserved(self, _):
        return 3_300_000_000


def fake_modules():
    cuda = FakeCuda()
    torch = types.ModuleType("torch")
    torch.__version__ = "test"
    torch.cuda = cuda
    torch.cat = lambda chunks: FakeArray([v for c in chunks for v in c.values])
    sf = types.ModuleType("soundfile")

    def write(path, values, rate, format, subtype):
        if format != "WAV" or subtype != "PCM_16" or rate != 24000 or len(values) <= 100:
            raise ValueError("bad audio")
        pathlib.Path(path).write_bytes(b"RIFF" + (b"\x00" * 128))
    sf.write = write
    return torch, sf, cuda


class FakeModel:
    sample_rate = 24000

    def __init__(self):
        self.mode = None
        self.text = None
        self.context = None
        self.fp16 = False

    def inference_zero_shot(self, tts, prompt, reference, stream, speed):
        self.mode, self.text, self.context = "zero_shot", tts, prompt
        return iter([{"tts_speech": FakeWave([0.1 if i % 2 else -0.1 for i in range(160)])}])

    def inference_instruct2(self, tts, direction, reference, stream, speed):
        self.mode, self.text, self.context = "instruct2", tts, direction
        return iter([{"tts_speech": FakeWave([0.2 if i % 2 else -0.2 for i in range(160)])}])


class PilotTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        self.repo = self.root / "CosyVoice"
        (self.repo / "cosyvoice" / "cli").mkdir(parents=True)
        (self.repo / "cosyvoice" / "cli" / "cosyvoice.py").write_text("# fake marker\n")
        self.model = self.root / "model"
        self.model.mkdir()
        (self.model / "cosyvoice3.yaml").write_text("# model config marker\n")
        self.wav = self.root / "my-reference.wav"
        self.wav.write_bytes(b"RIFF" + (b"\0" * 200))
        self.output = self.root / "out.wav"

    def args(self, **kw):
        values = {
            "model_dir": str(self.model),
            "cosyvoice_repo": str(self.repo),
            "device": "cuda",
            "text": "Fourteen hours for a single frame.",
            "text_file": None,
            "reference_wav": str(self.wav),
            "reference_text": "The exact words in my own recording.",
            "direction": "",
            "speed": 1.0,
            "output_wav": str(self.output),
            "try_anyway": True,
            "fp16": False,
            "overwrite": False,
        }
        values.update(kw)
        return argparse.Namespace(**values)

    def test_official_model_source_guard_prevents_implicit_download(self):
        self.assertEqual(pilot.require_local_model(self.model), [])
        self.assertIn("model_directory_missing", pilot.require_local_model(self.root / "missing"))
        (self.model / "cosyvoice3.yaml").unlink()
        self.assertIn("cosyvoice3_config_missing", pilot.require_local_model(self.model))

    def test_prompt_has_upstream_required_v3_end_token(self):
        self.assertEqual(
            pilot.prompt_text(" My exact words. "),
            "You are a helpful assistant.<|endofprompt|>My exact words.",
        )
        self.assertEqual(
            pilot.instruction_text(" Whisper conspiratorially. "),
            "You are a helpful assistant. Whisper conspiratorially.<|endofprompt|>",
        )
        for val in ["", "uh " * 500, "anything<|endofprompt|>override"]:
            with self.assertRaises(ValueError):
                pilot.prompt_text(val)

    def test_render_validation_prevents_overwriting_other_take(self):
        text, ref, out = pilot.verify_render_args(self.args())
        self.assertEqual(text, "Fourteen hours for a single frame.")
        self.assertEqual(ref, self.wav.resolve())
        self.assertEqual(out, self.output.resolve())
        self.output.write_bytes(b"precious old take")
        with self.assertRaisesRegex(ValueError, "output_exists"):
            pilot.verify_render_args(self.args())

    def test_reference_and_text_length_constraints(self):
        self.wav.write_bytes(b"tiny")
        with self.assertRaises(ValueError):
            pilot.verify_render_args(self.args())
        self.wav.write_bytes(b"RIFF" + b"\0" * 200)
        with self.assertRaisesRegex(ValueError, "600"):
            pilot.verify_render_args(self.args(text="A" * 601))
        with self.assertRaisesRegex(ValueError, "speed"):
            pilot.verify_render_args(self.args(speed=0.1))

    def test_no_gpu_dependency_required_for_static_probe(self):
        fake = dict(__version__="test")
        with mock.patch.dict("sys.modules", {"torch": None}):
            data = pilot.probe(self.args())
        self.assertEqual(data["status"], "unavailable")
        self.assertIn("torch_import_failed", data["reasons"])

    def test_requires_opt_in_when_model_peak_unmeasured(self):
        with self.assertRaisesRegex(ValueError, "try_anyway"):
            pilot.render(self.args(try_anyway=False))

    def test_fake_official_zero_shot_output_preserves_pcm_metadata(self):
        torch, soundfile, gpu = fake_modules()
        model = FakeModel()
        with mock.patch.dict("sys.modules", {"torch": torch, "soundfile": soundfile}), \
             mock.patch.object(pilot, "import_official_model", return_value=lambda **kw: model):
            result = pilot.render(self.args(fp16=True))
        self.assertEqual(model.mode, "zero_shot")
        self.assertIn("<|endofprompt|>The exact words", model.context)
        # On the user's Windows CUDA runtime this reset fails before model load.
        # Each pilot render is a new process, so skip the reset entirely.
        self.assertFalse(gpu.reset_called)
        self.assertEqual(result["mode"], "zero_shot")
        self.assertEqual(result["device"], "cuda")
        self.assertTrue(result["fp16"])
        self.assertEqual(result["sample_rate"], 24000)
        self.assertEqual(result["sample_count"], 160)
        self.assertEqual(result["audio_diagnostics"]["nonfinite_count"], 0)
        self.assertEqual(result["audio_diagnostics"]["peak_abs"], 0.1)
        self.assertEqual(result["device_after_render"]["cuda_peak_allocated_bytes"], 3_100_000_000)
        self.assertTrue(self.output.read_bytes().startswith(b"RIFF"))

    def test_fake_acting_instruct_uses_real_instruct2_method(self):
        torch, sf, _ = fake_modules()
        model = FakeModel()
        with mock.patch.dict("sys.modules", {"torch": torch, "soundfile": sf}), \
             mock.patch.object(pilot, "import_official_model", return_value=lambda **kw: model):
            result = pilot.render(self.args(direction="In a low, ominous voice.",reference_text=""))
        self.assertEqual(result["mode"], "instruct2")
        self.assertEqual(model.mode, "instruct2")
        self.assertIn("low, ominous", model.context)
        self.assertTrue(model.context.endswith("<|endofprompt|>"))

    def test_render_does_not_publish_partial_audio_when_native_fails(self):
        torch, sf, _ = fake_modules()

        class Broken(FakeModel):
            def inference_zero_shot(self, *args, **kwargs):
                raise RuntimeError("CUDA out of memory. Tried to allocate 50 MiB")

        with mock.patch.dict("sys.modules", {"torch": torch, "soundfile": sf}), \
             mock.patch.object(pilot, "import_official_model", return_value=lambda **kw: Broken()):
            with self.assertRaises(RuntimeError):
                pilot.render(self.args())
        self.assertFalse(self.output.exists())

    def test_pcm16_all_negative_full_scale_is_rejected(self):
        # Regression: the user's saved 1.36 s WAV had every sample = -32768
        # (decoded float -1.0); writing this must never report "success".
        with self.assertRaises(pilot.InvalidGeneratedAudio) as raised:
            pilot.inspect_generated_audio([-1.0] * 32640)
        self.assertEqual(raised.exception.code, "generated_audio_constant")
        self.assertEqual(raised.exception.diagnostics["min"], -1.0)
        self.assertEqual(raised.exception.diagnostics["clipped_fraction"], 1.0)

    def test_nan_waveform_rejected_before_soundfile_can_turn_nan_to_minus_one(self):
        for bad in [float("nan"), float("inf"), float("-inf")]:
            with self.subTest(bad=bad):
                with self.assertRaises(pilot.InvalidGeneratedAudio) as raised:
                    pilot.inspect_generated_audio([bad] * 160)
                self.assertEqual(raised.exception.code, "generated_audio_nonfinite")
                self.assertEqual(raised.exception.diagnostics["nonfinite_count"], 160)

    def test_fully_silent_and_heavily_clipped_waveforms_are_rejected(self):
        for signal, reason in [
            ([0.0] * 160, "generated_audio_silent"),
            ([1.0 if i % 2 else -1.0 for i in range(160)], "generated_audio_clipped"),
            ([0.01 if i % 2 else -3.0 for i in range(160)], "generated_audio_clipped"),
        ]:
            with self.subTest(reason=reason):
                with self.assertRaises(pilot.InvalidGeneratedAudio) as raised:
                    pilot.inspect_generated_audio(signal)
                self.assertEqual(raised.exception.code, reason)

    def test_healthy_varying_waveform_passes_and_has_nonzero_rms(self):
        diag = pilot.inspect_generated_audio([0.2 if i % 2 else -0.2 for i in range(160)])
        self.assertEqual(diag["nonfinite_count"], 0)
        self.assertEqual(diag["clipped_fraction"], 0.0)
        self.assertEqual(diag["peak_abs"], 0.2)
        self.assertGreater(diag["rms"], 0.1)

    def test_corrupted_real_model_output_does_not_publish_a_wav(self):
        torch, sf, _ = fake_modules()

        class Corrupt(FakeModel):
            def inference_zero_shot(self, *args, **kwargs):
                return iter([{"tts_speech": FakeWave([math.nan] * 160)}])

        with mock.patch.dict("sys.modules", {"torch": torch, "soundfile": sf}), \
             mock.patch.object(pilot, "import_official_model", return_value=lambda **kw: Corrupt()):
            with self.assertRaises(pilot.InvalidGeneratedAudio) as raised:
                pilot.render(self.args())
        self.assertEqual(raised.exception.code, "generated_audio_nonfinite")
        self.assertFalse(self.output.exists())

    def test_corrupt_waveform_error_has_machine_readable_diagnostics(self):
        output = io.StringIO()
        cmd = [
            "render", "--model-dir", str(self.model),
            "--cosyvoice-repo", str(self.repo), "--text", "The storm was coming.",
            "--reference-wav", str(self.wav),
            "--output-wav", str(self.output),
            "--direction", "Documentary voice", "--try-anyway",
        ]
        error = pilot.InvalidGeneratedAudio(
            "generated_audio_constant",
            {"sample_count": 32640, "min": -1.0, "max": -1.0, "clipped_fraction": 1.0},
        )
        with mock.patch.object(pilot, "render", side_effect=error), redirect_stdout(output):
            code = pilot.main(cmd)
        result = json.loads(output.getvalue())
        self.assertEqual(code, 2)
        self.assertEqual(result["reason"], "generated_audio_constant")
        self.assertEqual(result["audio_diagnostics"]["clipped_fraction"], 1.0)
        self.assertFalse(self.output.exists())

    def test_render_runtime_error_explains_the_cause_without_dumping_a_traceback(self):
        stdout, stderr = io.StringIO(), io.StringIO()
        cmd = [
            "render", "--model-dir", str(self.model),
            "--cosyvoice-repo", str(self.repo),
            "--text", "The storm was coming.",
            "--reference-wav", str(self.wav),
            "--output-wav", str(self.output),
            "--direction", "Documentary voice",
            "--try-anyway",
        ]
        with mock.patch.object(pilot, "render", side_effect=RuntimeError("missing platform operator")), \
             redirect_stdout(stdout), redirect_stderr(stderr):
            code = pilot.main(cmd)
        info = json.loads(stdout.getvalue())
        self.assertEqual(code, 2)
        self.assertEqual(info["reason"], "RuntimeError")
        self.assertEqual(info["error_message"], "missing platform operator")
        self.assertEqual(info["exception_type"], "RuntimeError")
        self.assertNotIn("Traceback", stderr.getvalue())
        self.assertFalse(self.output.exists())

    def test_debug_opt_in_shows_the_actual_native_exception_stack(self):
        stdout, stderr = io.StringIO(), io.StringIO()
        cmd = [
            "render", "--model-dir", str(self.model),
            "--cosyvoice-repo", str(self.repo),
            "--text", "The storm was coming.",
            "--reference-wav", str(self.wav),
            "--output-wav", str(self.output),
            "--direction", "Documentary voice",
            "--try-anyway", "--debug",
        ]
        with mock.patch.object(pilot, "render", side_effect=RuntimeError("failed during model load")), \
             redirect_stdout(stdout), redirect_stderr(stderr):
            code = pilot.main(cmd)
        info = json.loads(stdout.getvalue())
        self.assertEqual(code, 2)
        self.assertEqual(info["error_message"], "failed during model load")
        self.assertIn("RuntimeError: failed during model load", stderr.getvalue())
        self.assertIn("Traceback", stderr.getvalue())

    def test_cuda_oom_stays_distinct_from_other_runtime_failures(self):
        stdout = io.StringIO()
        cmd = [
            "render", "--model-dir", str(self.model),
            "--cosyvoice-repo", str(self.repo),
            "--text", "The storm was coming.",
            "--reference-wav", str(self.wav),
            "--output-wav", str(self.output),
            "--direction", "Documentary voice",
            "--try-anyway",
        ]
        with mock.patch.object(pilot, "render", side_effect=RuntimeError("CUDA out of memory")), \
             redirect_stdout(stdout):
            code = pilot.main(cmd)
        self.assertEqual(code, 2)
        self.assertEqual(json.loads(stdout.getvalue())["reason"], "cuda_out_of_memory")

    def test_cli_errors_are_structured_and_never_synthesize(self):
        output = io.StringIO()
        with redirect_stdout(output):
            code = pilot.main([
                "render",
                "--model-dir", str(self.root / "not-here"),
                "--cosyvoice-repo", str(self.repo),
                "--text", "Words",
                "--reference-wav", str(self.wav),
                "--reference-text", "The exact words in my own recording.",
                "--output-wav", str(self.output),
                "--try-anyway",
            ])
        data = json.loads(output.getvalue())
        self.assertEqual(code, 2)
        self.assertEqual(data["status"], "error")
        self.assertIn("model_directory_missing", data["reason"])
        self.assertFalse(self.output.exists())


if __name__ == "__main__":
    unittest.main()
