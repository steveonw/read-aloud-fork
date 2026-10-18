# M0: Upstream Read-Aloud baseline import

**Status:** baseline source imported for review; behavioral changes intentionally excluded.  
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

The **full USB bundle smoke test** additionally needs Emscripten, CMake, Ninja, external voice/model downloads, and the original `build-usb.yml` workflow. A green quick CI check does **not** prove the complete USB build, real speech playback, runtime browser smoke, or export paths. Those remain independently required to mark *all* of M0 complete.

## M0 acceptance log

| Check | Status |
| --- | --- |
| Source snapshot frozen by exact upstream commit | Done |
| Source/text/fonts/vendor assets available in new Git repo | Done |
| Upstream files' Git blob SHA verified during import | Done |
| Original license notices and attribution kept | Done |
| Go unit/vet/build | **PASS** — Ubuntu 24.04, Go 1.23; `go test ./cmd/...`, `go vet ./...`, `go build` |
| JavaScript unit/stress tests | **PASS** — 214/214 logic checks, 12/12 stress checks, Node 22 |
| Full cross-platform USB build with generated WASM | **Not run yet** |
| Real-browser F8 and WAV/MP3 export smoke test | **Not run yet** |

The `launcher` omission is the only divergence from the upstream tracked tree. Do not say “M0 fully verified” until both quick and full build/runtime checks have been completed or their limitations explicitly accepted.

## What comes next

Once the import PR is reviewed, run the original **Build Read Aloud USB** workflow (or `./scripts/build_all.sh`) and inspect the real-browser smoke artifacts. Only then begin M1 backend abstraction; preserve the old WASM offline proofreading path as the fallback.
