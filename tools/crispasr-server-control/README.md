# CrispASR Server Control — Windows mini app

A separate Start / Stop window for the local CrispASR CosyVoice 3 engine used by the Read-Aloud M4 test version. No Git Bash commands are needed after setup. This download does NOT include CrispASR, CUDA DLLs, models, or Read-Aloud.

## How to use

1. Extract the GitHub Actions artifact ZIP; double-click **CrispASR Server Control.exe**.
2. It looks for your existing `crispasr-gguf-legacy/crispasr.exe` under your Windows user folder. If different, click **Browse...** and select your known-good executable. Do not replace it.
3. If CrispASR is currently running in Git Bash, the GUI says **Running externally**. Stop that old server with Ctrl+C once. The controller will not terminate an external process.
4. Press **Start server** and wait for **Running — cosyvoice3-tts-rl**. Launch Read-Aloud normally.
5. When finished generating speech, press **Stop server** and confirm. It may interrupt any active generation.

You may close the mini controller while CrispASR continues running. Reopen the same utility later to stop its verified server process.

## Exact native command

```text
--server --backend cosyvoice3-tts-rl -m auto --voice fleurs-en --i-have-rights --host 127.0.0.1 --port 18080
```

The existing server starts from its current folder in a minimized native console, which you can open from the Windows taskbar to inspect engine messages. The controller uses only loopback address 127.0.0.1:18080. It does not run a second server if that port is occupied.

Stop is allowed **only** if the process ID, start timestamp, and executable path match the process originally launched by this controller. It does not use a global taskkill-by-name operation. It remembers its selected executable path and managed process record in `%LOCALAPPDATA%\ReadAloudCrispASRControl`.

The app does not change your CosyVoice models, GPU settings, voice rights, AI disclosure, audio watermarking, or original Read-Aloud installation. Future Qwen model switching is not included in this initial controller.

## If something looks wrong

- **Running externally:** Stop the manually started CrispASR in the Git Bash/console where you launched it.
- **Port 18080 occupied:** Another program is bound to that port; no duplicate will be started.
- **Starting / loading models:** The engine is alive but has not completed startup. View the minimized console for logs.
- **Stop disabled:** The controller cannot prove it started that exact process and will not terminate it.
- **Failed to start:** Check that you browsed to the already working custom portable-CPU CUDA `crispasr.exe`, with its companion DLLs.

## Implementation

Transparent C# Windows Forms source is `Program.cs`. GitHub Actions compiles it using the Windows .NET Framework compiler, and runs a no-GUI startup-configuration self-check. It is a separate unsigned, experimental executable—not an installer, and no administrator permission is required.
