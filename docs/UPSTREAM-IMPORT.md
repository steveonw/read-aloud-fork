# M0: Upstream Read-Aloud baseline import

**Status:** **M0 verified on GitHub Actions and ready for merge**; baseline product behavior intentionally unchanged.  
**Import date:** 2026-10-17  
**Upstream repository:** https://github.com/steveonw/Read-Aloud-Main  
**Frozen upstream commit:** [`9187d5c4e97686ee65d1923860022faea8b91dfc`](https://github.com/steveonw/Read-Aloud-Main/commit/9187d5c4e97686ee65d1923860022faea8b91dfc)  
**New repository:** https://github.com/steveonw/read-aloud-fork  
**Companion architecture spec:** [FORK-SPEC.md](../FORK-SPEC.md)

## Provenance and exactness

- Imported all **43** tracked upstream files except the generated root-level `launcher` executable (44 files in the original upstream snapshot).
- The original `LICENSE` was already present in the new repo and has **the same Git blob SHA** as upstream.
- Imported files were read at the frozen upstream commit and re-created as Git blobs in this repository. Git blob SHA checks confirmed **byte-for-byte equality** for source, tests, assets, fonts, documentation and build scripts.
- The upstream root `launcher` is a **9,436,757-byte prebuilt executable**, omitted because the GitHub Contents API does not return its binary content above the API limit. It is not application source; the Go launcher can be rebuilt from `cmd/launcher/` and the existing build scripts. If strict distribution-file equivalence becomes necessary, import that executable separately through a normal Git transfer.
- `FORK-SPEC.md` is preserved from the new repository's `main` branch. No upstream source file was modified in M0.
- The original `.github/workflows/build-usb.yml` is preserved. It builds the portable USB ZIP using downloaded upstream WASM/voice assets; those generated build products are not committed.

## Baseline acceptance checks

Run in an environment with Go 1.23+, Node.js 22+, and network access to install `jsdom`:

```bash
go test ./cmd/...
go vet ./...
go build -o /tmp/readaloud-launcher ./cmd/launcher
npm install --no-save jsdom@29.1.1
node scripts/web_tests.js . 17391
node scripts/stress_tests.js .
```

A separate workflow `.github/workflows/m0-baseline.yml` runs those baseline checks in GitHub Actions on pull requests and this import branch.

Quick baseline verification: [GitHub Actions run #39091923320](https://github.com/steveonw/read-aloud-fork/actions/runs/39091923320) — **SUCCESS**, including Bash syntax checks.

The full USB/WASM bundle and real-browser tests were run in [M0 full validation run #39092588513](https://github.com/steveonw/read-aloud-fork/actions/runs/39092588513), which **completed successfully** on Ubuntu 24.04. The dedicated `.github/workflows/m0-usb-validation.yml` uses the existing upstream USB builder, packages Amy and Lessac voices, launches real Chromium, records narration and verifies actual WAV and MP3 bytes. The workflow produced the `ReadAloudUSB` ZIP artifact (GitHub artifact ID `12123299041`; ZIP SHA256 `7be40c87197f9a8fdb92cba112fcac56a57f1f9954cd8ab5deca05685c5c13cb`) and browser screenshots (artifact ID `12124285696`). This confirms cross-built bundle output on Linux, **not** manual launch on Windows/macOS, nor any CosyVoice/CUDA capability.

## M0 acceptance log

| Check | Status |
| --- | --- |
| Source snapshot frozen by exact upstream commit | Done |
| Source/text/fonts/vendor assets available in new Git repo | Done |
| Upstream files' Git blob SHA verified during import | Done |
| Original license notices and attribution kept | Done |
| Go unit/vet/build | **PASS** — Ubuntu 24.04, Go 1.23; `go test ./cmd/...`, `go vet ./...`, `go build` |
| JavaScript unit/stress tests | **PASS** — 214/214 logic checks, 12/12 stress checks, Node 22 |
| USB ZIP cross-built with generated WASM, 2 voices, checksum/smoke checks | **PASS** — run #39092588513, on Ubuntu 24.04 |
| Real Chromium voice load, playback/highlighting, render, WAV/MP3 export | **PASS** — 14/14 runtime checks |\n| Corrupt payload / drive-loss / browser data stress | **PASS** — 7/7 browser stress checks |\n| Manual Windows 1650 / 20 GB and macOS device smoke | **Deferred** — not part of Linux CI M0 |

The prebuilt root `launcher` omission is the sole divergence from the original 44 tracked upstream files. The generated launchers are rebuilt by CI. CI logged non-blocking dependency-deprecation, linker and Emscripten cache warnings; no tests failed. The packaged output is proven in Linux CI, and hands-on Windows/macOS testing remains a useful separate verification.

## What comes next

After review, merge the M0 PR and begin **M1 backend abstraction**. Preserve the working Sherpa WASM proofreader as a fallback. First Windows/GTX 1650 native CosyVoice testing belongs to M2; 20 GB system RAM and 4 GB VRAM are the first user's target.
