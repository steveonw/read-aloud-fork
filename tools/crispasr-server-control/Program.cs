// Optional portable local server controller for Read-Aloud M4.
// Windows 10+, .NET Framework 4.x. Does NOT install, alter, or update CrispASR.
// Browse an existing GGUF, choose CosyVoice or Qwen, then start the user's existing crispasr.exe.
// No downloads, installs, model changes, external hosts, or automatic server switching in the controller.
// Stop is allowed only for the exact process instance started by this controller.
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;

namespace ReadAloudCrispASRControl
{
    internal static class Program
    {
        [STAThread]
        private static int Main(string[] args)
        {
            if (args.Length == 1 && args[0] == "--self-test")
                return SelfTest();
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new ServerWindow());
            return 0;
        }

        private static int SelfTest()
        {
            string cosy = ServerWindow.MakeArguments();
            string qwen = ServerWindow.MakeArguments("qwen3-tts-1.7b-customvoice", "", "");
            string picked = ServerWindow.MakeArguments(
                "qwen3-tts-1.7b-customvoice",
                @"C:\Speech Models\talker.gguf", @"C:\Speech Models\codec.gguf");
            string pickedCosy = ServerWindow.MakeArguments(
                "cosyvoice3-tts-rl", @"C:\Speech Models\cosyvoice3-llm-rl-q4_k.gguf", "");
            bool valid = cosy.Contains("--backend cosyvoice3-tts-rl -m auto")
                && cosy.Contains("--voice fleurs-en --i-have-rights")
                && qwen.Contains("--backend qwen3-tts-1.7b-customvoice -m auto")
                && qwen.Contains("--voice vivian")
                && picked.Contains("-m \"C:\\Speech Models\\talker.gguf\"")
                && picked.Contains("--codec-model \"C:\\Speech Models\\codec.gguf\"")
                && pickedCosy.Contains("-m \"C:\\Speech Models\\cosyvoice3-llm-rl-q4_k.gguf\"");
            valid = valid && cosy.Contains("--host 127.0.0.1 --port 18080")
                && qwen.Contains("--host 127.0.0.1 --port 18080")
                && !cosy.Contains("--no-watermark") && !qwen.Contains("--no-watermark")
                && !picked.Contains("--no-c2pa");
            string h = ServerWindow.ParseHealth("{\"status\":\"ok\",\"backend\":\"cosyvoice3-tts-rl\"}");
            string qh = ServerWindow.ParseHealth("{\"status\":\"ok\",\"backend\":\"qwen3-tts-1.7b-customvoice\"}");
            string other = ServerWindow.ParseHealth("{\"status\":\"error\",\"backend\":\"cosyvoice3-tts-rl\"}");
            valid = valid && h == "cosyvoice3-tts-rl"
                && qh == "qwen3-tts-1.7b-customvoice" && other == null;
            return valid ? 0 : 1;
        }
    }

    internal sealed class ServerWindow : Form
    {
        private const string LocalHealthUrl = "http://127.0.0.1:18080/health";
        private const string CosyBackend = "cosyvoice3-tts-rl";
        private const string QwenBackend = "qwen3-tts-1.7b-customvoice";
        private readonly string stateDirectory;
        private readonly string managedFile;
        private readonly string settingsFile;
        private readonly string backendSettingsFile;
        private readonly string cosyModelSettingsFile;
        private readonly string qwenModelSettingsFile;
        private readonly string codecSettingsFile;
        private readonly TextBox pathInput;
        private readonly ComboBox engineSelect;
        private readonly TextBox modelInput;
        private readonly TextBox codecInput;
        private readonly Button browseCodec;
        private readonly CheckBox rightsCheck;
        private readonly Label status;
        private readonly Label note;
        private readonly Button startButton;
        private readonly Button stopButton;
        private readonly Timer refreshTimer;
        private bool busy;

        // Fixed backend and address allowlist. The selected model is an existing local
        // GGUF, passed directly to the executable (never through a shell).
        public static string MakeArguments()
        {
            return MakeArguments(CosyBackend, "", "");
        }

        private static string QuoteModelArgument(string path)
        {
            if (String.IsNullOrEmpty(path) || path.IndexOf('"') >= 0 ||
                path.IndexOf('\r') >= 0 || path.IndexOf('\n') >= 0)
                throw new ArgumentException("Invalid local model path");
            return "\"" + Path.GetFullPath(path) + "\"";
        }

        public static string MakeArguments(string backend, string model, string codec)
        {
            if (backend != CosyBackend && backend != QwenBackend)
                throw new ArgumentException("Unsupported speech backend");
            string args = "--server --backend " + backend + " -m " +
                (String.IsNullOrEmpty(model) ? "auto" : QuoteModelArgument(model));
            if (backend == CosyBackend)
            {
                if (!String.IsNullOrEmpty(codec)) throw new ArgumentException("CosyVoice has no Qwen codec option");
                args += " --voice fleurs-en --i-have-rights";
            }
            else
            {
                args += " --voice vivian";
                if (!String.IsNullOrEmpty(codec))
                    args += " --codec-model " + QuoteModelArgument(codec);
            }
            return args + " --host 127.0.0.1 --port 18080";
        }

        public ServerWindow()
        {
            Text = "CrispASR Server Control - Read-Aloud";
            ClientSize = new Size(658, 532);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            Font = new Font("Segoe UI", 9F);
            BackColor = Color.FromArgb(246, 248, 251);

            stateDirectory = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "ReadAloudCrispASRControl");
            managedFile = Path.Combine(stateDirectory, "managed-process.txt");
            settingsFile = Path.Combine(stateDirectory, "crispasr-path.txt");
            backendSettingsFile = Path.Combine(stateDirectory, "selected-backend.txt");
            cosyModelSettingsFile = Path.Combine(stateDirectory, "cosy-model.txt");
            qwenModelSettingsFile = Path.Combine(stateDirectory, "qwen-model.txt");
            codecSettingsFile = Path.Combine(stateDirectory, "qwen-codec.txt");

            Label title = new Label();
            title.Text = "CrispASR - Local Speech Server";
            title.Font = new Font("Segoe UI", 15F, FontStyle.Bold);
            title.Location = new Point(22, 15);
            title.Size = new Size(610, 33);
            Controls.Add(title);

            Label subtitle = new Label();
            subtitle.Text = "Choose CosyVoice or Qwen, find a local GGUF, then start the server.";
            subtitle.Location = new Point(23, 50);
            subtitle.Size = new Size(610, 24);
            Controls.Add(subtitle);

            Label pathLabel = new Label();
            pathLabel.Text = "Location of your working crispasr.exe:";
            pathLabel.Location = new Point(23, 85);
            pathLabel.Size = new Size(570, 20);
            Controls.Add(pathLabel);

            pathInput = new TextBox();
            pathInput.Location = new Point(23, 108);
            pathInput.Size = new Size(493, 25);
            pathInput.Text = InitialExePath();
            Controls.Add(pathInput);

            Button browse = new Button();
            browse.Text = "Browse...";
            browse.Location = new Point(524, 105);
            browse.Size = new Size(112, 30);
            browse.Click += delegate { BrowseExe(); };
            Controls.Add(browse);

            Label engineLabel = new Label();
            engineLabel.Text = "Speech engine:";
            engineLabel.Location = new Point(23, 145);
            engineLabel.Size = new Size(600, 22);
            Controls.Add(engineLabel);

            engineSelect = new ComboBox();
            engineSelect.DropDownStyle = ComboBoxStyle.DropDownList;
            engineSelect.Location = new Point(23, 168);
            engineSelect.Size = new Size(613, 27);
            engineSelect.Items.Add("CosyVoice 3 GGUF - English (fleurs-en)");
            engineSelect.Items.Add("Qwen3-TTS 1.7B CustomVoice (vivian)");
            engineSelect.SelectedIndex = ReadPreference(backendSettingsFile) == QwenBackend ? 1 : 0;
            Controls.Add(engineSelect);

            Label modelLabel = new Label();
            modelLabel.Text = "Local GGUF model (optional; blank uses CrispASR cache / may download missing files):";
            modelLabel.Location = new Point(23, 205);
            modelLabel.Size = new Size(610, 20);
            Controls.Add(modelLabel);

            modelInput = new TextBox();
            modelInput.Location = new Point(23, 227);
            modelInput.Size = new Size(493, 25);
            Controls.Add(modelInput);

            Button browseModel = new Button();
            browseModel.Text = "Find model...";
            browseModel.Location = new Point(524, 224);
            browseModel.Size = new Size(112, 30);
            browseModel.Click += delegate { BrowseModel(); };
            Controls.Add(browseModel);

            Label codecLabel = new Label();
            codecLabel.Text = "Qwen tokenizer / codec GGUF (needed when choosing a Qwen model file):";
            codecLabel.Location = new Point(23, 263);
            codecLabel.Size = new Size(610, 20);
            Controls.Add(codecLabel);

            codecInput = new TextBox();
            codecInput.Location = new Point(23, 285);
            codecInput.Size = new Size(493, 25);
            Controls.Add(codecInput);

            browseCodec = new Button();
            browseCodec.Text = "Find codec...";
            browseCodec.Location = new Point(524, 282);
            browseCodec.Size = new Size(112, 30);
            browseCodec.Click += delegate { BrowseCodec(); };
            Controls.Add(browseCodec);

            rightsCheck = new CheckBox();
            rightsCheck.Text = "I have rights to use the CosyVoice voice preset.";
            rightsCheck.Location = new Point(23, 322);
            rightsCheck.Size = new Size(615, 25);
            rightsCheck.Checked = false;
            Controls.Add(rightsCheck);

            status = new Label();
            status.Text = "Checking...";
            status.Location = new Point(23, 357);
            status.Size = new Size(610, 24);
            status.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
            status.ForeColor = Color.FromArgb(78, 86, 102);
            Controls.Add(status);

            note = new Label();
            note.Text = "Server address: 127.0.0.1:18080";
            note.Location = new Point(23, 384);
            note.Size = new Size(615, 30);
            Controls.Add(note);

            startButton = new Button();
            startButton.Text = "Start server";
            startButton.Location = new Point(23, 422);
            startButton.Size = new Size(138, 38);
            startButton.BackColor = Color.FromArgb(216, 231, 255);
            startButton.Click += delegate { StartServer(); };
            Controls.Add(startButton);

            stopButton = new Button();
            stopButton.Text = "Stop server";
            stopButton.Location = new Point(172, 422);
            stopButton.Size = new Size(138, 38);
            stopButton.Click += delegate { StopServer(); };
            Controls.Add(stopButton);

            Button refresh = new Button();
            refresh.Text = "Refresh";
            refresh.Location = new Point(322, 422);
            refresh.Size = new Size(118, 38);
            refresh.Click += delegate { RefreshStatus(); };
            Controls.Add(refresh);

            Button openDir = new Button();
            openDir.Text = "Open folder";
            openDir.Location = new Point(451, 422);
            openDir.Size = new Size(185, 38);
            openDir.Click += delegate { OpenFolder(); };
            Controls.Add(openDir);

            Label footer = new Label();
            footer.Text = "Start/Stop is manual. Closing this window leaves your managed server running.";
            footer.Location = new Point(23, 481);
            footer.Size = new Size(615, 24);
            footer.ForeColor = Color.FromArgb(87, 95, 107);
            Controls.Add(footer);

            engineSelect.SelectedIndexChanged += delegate { OnEngineChanged(); };
            OnEngineChanged();

            refreshTimer = new Timer();
            refreshTimer.Interval = 1800;
            refreshTimer.Tick += delegate { RefreshStatus(); };
            refreshTimer.Start();
            Shown += delegate { RefreshStatus(); };
            FormClosed += delegate { refreshTimer.Stop(); };
        }

        private string InitialExePath()
        {
            try
            {
                if (File.Exists(settingsFile))
                {
                    string saved = File.ReadAllText(settingsFile, Encoding.UTF8).Trim();
                    if (File.Exists(saved)) return saved;
                }
            }
            catch (Exception) { /* optional preference file */ }
            return Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                "crispasr-gguf-legacy", "crispasr.exe");
        }

        private void BrowseExe()
        {
            using (OpenFileDialog picker = new OpenFileDialog())
            {
                picker.Title = "Choose your existing crispasr.exe";
                picker.Filter = "CrispASR executable (crispasr.exe)|crispasr.exe|Executable files (*.exe)|*.exe";
                picker.CheckFileExists = true;
                if (picker.ShowDialog(this) == DialogResult.OK)
                {
                    pathInput.Text = picker.FileName;
                    RefreshStatus();
                }
            }
        }

        private static string ReadPreference(string file)
        {
            try { return File.Exists(file) ? File.ReadAllText(file, Encoding.UTF8).Trim() : ""; }
            catch (Exception) { return ""; }
        }

        private void SavePreferences(string model, string codec)
        {
            try
            {
                Directory.CreateDirectory(stateDirectory);
                File.WriteAllText(backendSettingsFile, SelectedBackend(), Encoding.UTF8);
                File.WriteAllText(SelectedBackend() == QwenBackend ? qwenModelSettingsFile : cosyModelSettingsFile,
                                  model, Encoding.UTF8);
                if (SelectedBackend() == QwenBackend)
                    File.WriteAllText(codecSettingsFile, codec, Encoding.UTF8);
            }
            catch (Exception) { /* preferences are optional; process ownership is separate */ }
        }

        private string SelectedBackend()
        {
            return engineSelect.SelectedIndex == 1 ? QwenBackend : CosyBackend;
        }

        private void OnEngineChanged()
        {
            bool qwen = SelectedBackend() == QwenBackend;
            modelInput.Text = ReadPreference(qwen ? qwenModelSettingsFile : cosyModelSettingsFile);
            codecInput.Text = qwen ? ReadPreference(codecSettingsFile) : "";
            codecInput.Enabled = qwen;
            browseCodec.Enabled = qwen;
            rightsCheck.Enabled = !qwen;
            rightsCheck.Checked = false;
            RefreshStatus();
        }

        private void BrowseModel()
        {
            using (OpenFileDialog picker = new OpenFileDialog())
            {
                picker.Title = "Choose your local speech model (.gguf)";
                picker.Filter = "GGUF model (*.gguf)|*.gguf";
                picker.CheckFileExists = true;
                if (picker.ShowDialog(this) != DialogResult.OK) return;
                modelInput.Text = picker.FileName;
                if (SelectedBackend() == QwenBackend && String.IsNullOrWhiteSpace(codecInput.Text))
                {
                    string sibling = Path.Combine(Path.GetDirectoryName(picker.FileName),
                                                 "qwen3-tts-tokenizer-12hz.gguf");
                    if (File.Exists(sibling)) codecInput.Text = sibling;
                }
                SavePreferences(modelInput.Text, codecInput.Text);
            }
        }

        private void BrowseCodec()
        {
            using (OpenFileDialog picker = new OpenFileDialog())
            {
                picker.Title = "Choose your Qwen3-TTS tokenizer / codec GGUF";
                picker.Filter = "GGUF codec (*.gguf)|*.gguf";
                picker.CheckFileExists = true;
                if (picker.ShowDialog(this) != DialogResult.OK)
                    return;
                codecInput.Text = picker.FileName;
                SavePreferences(modelInput.Text, codecInput.Text);
            }
        }

        private static string ValidateFile(string path, string label)
        {
            if (String.IsNullOrEmpty(path)) return null;
            if (path.IndexOf('"') >= 0 || path.IndexOf('\r') >= 0 || path.IndexOf('\n') >= 0)
                return label + " contains invalid characters.";
            if (!File.Exists(path)) return label + " was not found. Browse for an existing local file.";
            if (!String.Equals(Path.GetExtension(path), ".gguf", StringComparison.OrdinalIgnoreCase))
                return label + " must be a .gguf file.";
            return null;
        }

        private static bool PathsMatch(string a, string b)
        {
            try
            {
                return string.Equals(Path.GetFullPath(a), Path.GetFullPath(b),
                                     StringComparison.OrdinalIgnoreCase);
            }
            catch (Exception) { return false; }
        }

        // Only an exact PID + start timestamp + executable-path match grants Stop.
        // This protects other CrispASR sessions and unrelated reused process IDs.
        private Process OwnedProcess()
        {
            try
            {
                if (!File.Exists(managedFile)) return null;
                string[] s = File.ReadAllLines(managedFile);
                if (s.Length != 3) return null;
                int pid;
                long ticks;
                if (!int.TryParse(s[0], out pid) || !long.TryParse(s[1], out ticks) || pid <= 0)
                    return null;
                string expectedPath = Encoding.UTF8.GetString(Convert.FromBase64String(s[2]));
                Process p = Process.GetProcessById(pid);
                if (p.HasExited || p.StartTime.ToUniversalTime().Ticks != ticks ||
                    !PathsMatch(p.MainModule.FileName, expectedPath))
                {
                    p.Dispose();
                    return null;
                }
                return p;
            }
            catch (Exception) { return null; }
        }

        private void StoreOwned(Process p, string exe)
        {
            Directory.CreateDirectory(stateDirectory);
            File.WriteAllLines(managedFile, new string[] {
                p.Id.ToString(),
                p.StartTime.ToUniversalTime().Ticks.ToString(),
                Convert.ToBase64String(Encoding.UTF8.GetBytes(Path.GetFullPath(exe)))
            });
            File.WriteAllText(settingsFile, Path.GetFullPath(exe), Encoding.UTF8);
        }

        // Parse only the local /health response. Do not connect to cloud hosts.
        public static string ParseHealth(string json)
        {
            if (!Regex.IsMatch(json, "\"status\"\\s*:\\s*\"ok\"",
                               RegexOptions.IgnoreCase)) return null;
            Match match = Regex.Match(json, "\"backend\"\\s*:\\s*\"([^\"]+)\"");
            return match.Success ? match.Groups[1].Value : null;
        }

        private static string GetHealth()
        {
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(LocalHealthUrl);
                req.Proxy = null;
                req.Timeout = 550;
                req.ReadWriteTimeout = 550;
                using (HttpWebResponse res = (HttpWebResponse)req.GetResponse())
                using (StreamReader rd = new StreamReader(res.GetResponseStream()))
                {
                    if (res.StatusCode != HttpStatusCode.OK) return null;
                    return ParseHealth(rd.ReadToEnd());
                }
            }
            catch (Exception) { return null; }
        }

        private static bool PortOccupied()
        {
            using (TcpClient client = new TcpClient())
            {
                IAsyncResult connection = null;
                try
                {
                    connection = client.BeginConnect(IPAddress.Loopback, 18080, null, null);
                    if (!connection.AsyncWaitHandle.WaitOne(250)) return false;
                    client.EndConnect(connection);
                    return true;
                }
                catch (Exception) { return false; }
                finally
                {
                    if (connection != null) connection.AsyncWaitHandle.Close();
                }
            }
        }

        private void Display(string headline, string subtext, Color color,
                             bool canStart, bool canStop)
        {
            status.Text = headline;
            status.ForeColor = color;
            note.Text = subtext;
            startButton.Enabled = canStart;
            stopButton.Enabled = canStop;
        }

        private void RefreshStatus()
        {
            if (busy) return;
            busy = true;
            try
            {
                string backend = GetHealth();
                bool portUsed = backend != null || PortOccupied();
                using (Process owned = OwnedProcess())
                {
                    if (owned != null)
                    {
                        if (backend != null)
                            Display("Running - " + backend,
                                    "Started by this controller. Ready on 127.0.0.1:18080.",
                                    Color.FromArgb(28, 129, 71), false, true);
                        else
                            Display("Starting server / loading models...",
                                    "The existing GGUF files are being loaded. This can take a while.",
                                    Color.FromArgb(153, 102, 15), false, true);
                    }
                    else if (backend != null)
                    {
                        Display("Running externally - " + backend,
                                "Started in Git Bash or another window. Stop it there; this tool will not kill it.",
                                Color.FromArgb(27, 92, 159), false, false);
                    }
                    else if (portUsed)
                    {
                        Display("Port 18080 is already occupied",
                                "Another application may be starting. Close it before starting CrispASR.",
                                Color.FromArgb(153, 102, 15), false, false);
                    }
                    else
                    {
                        Display("Stopped", "Choose a GGUF or leave the model path blank to use cached/default weights.",
                                Color.FromArgb(78, 86, 102), true, false);
                    }
                }
            }
            finally { busy = false; }
        }

        private void StartServer()
        {
            string exe = pathInput.Text.Trim().Trim('"');
            if (!File.Exists(exe) ||
                !String.Equals(Path.GetFileName(exe), "crispasr.exe",
                               StringComparison.OrdinalIgnoreCase))
            {
                MessageBox.Show(this, "Select your existing crispasr.exe first. " +
                                "Keep its matching CUDA DLLs alongside it.",
                                "Executable not found", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            string backend = SelectedBackend();
            string model = modelInput.Text.Trim().Trim('"');
            string codec = backend == QwenBackend ? codecInput.Text.Trim().Trim('"') : "";
            string invalid = ValidateFile(model, "Model");
            if (invalid == null) invalid = ValidateFile(codec, "Qwen tokenizer / codec");
            if (invalid != null)
            {
                MessageBox.Show(this, invalid, "Invalid model selection",
                                MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            if (backend == CosyBackend && !rightsCheck.Checked)
            {
                MessageBox.Show(this, "Confirm your rights to the CosyVoice preset before starting.",
                                "Voice rights", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            if (backend == QwenBackend && !String.IsNullOrEmpty(model) && String.IsNullOrEmpty(codec))
            {
                string sibling = Path.Combine(Path.GetDirectoryName(Path.GetFullPath(model)),
                                               "qwen3-tts-tokenizer-12hz.gguf");
                if (File.Exists(sibling))
                {
                    codec = sibling;
                    codecInput.Text = sibling;
                }
                else
                {
                    MessageBox.Show(this, "You selected a Qwen model file. Please also find its " +
                                    "qwen3-tts-tokenizer-12hz.gguf codec using Find codec. " +
                                    "For your previously cached model, you can instead leave both paths blank.",
                                    "Qwen codec required", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
            }
            if (backend == QwenBackend && String.IsNullOrEmpty(model) && !String.IsNullOrEmpty(codec))
            {
                MessageBox.Show(this, "Either choose both Qwen model and codec files, " +
                                "or leave both blank to use the cached/default models.",
                                "Qwen model missing", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            using (Process existing = OwnedProcess())
            {
                if (existing != null || GetHealth() != null || PortOccupied())
                {
                    MessageBox.Show(this, "Port 18080 is already in use or your server is starting. " +
                                    "Stop the existing engine before switching to another model.",
                                    "Already running", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    RefreshStatus();
                    return;
                }
            }
            try
            {
                ProcessStartInfo info = new ProcessStartInfo();
                info.FileName = Path.GetFullPath(exe);
                info.Arguments = MakeArguments(backend, model, codec);
                info.WorkingDirectory = Path.GetDirectoryName(info.FileName);
                // Runs only the chosen executable, never through cmd/PowerShell.
                info.UseShellExecute = true;
                info.WindowStyle = ProcessWindowStyle.Minimized;
                using (Process started = Process.Start(info))
                {
                    if (started == null) throw new InvalidOperationException("Could not start the server.");
                    StoreOwned(started, info.FileName);
                }
                SavePreferences(model, codec);
                RefreshStatus();
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, "Could not start CrispASR:\r\n" + ex.Message,
                                "Start failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
                RefreshStatus();
            }
        }

        private void StopServer()
        {
            using (Process owned = OwnedProcess())
            {
                if (owned == null)
                {
                    MessageBox.Show(this, "This controller did not start the current server, " +
                                    "or it cannot verify its identity. Stop it in the original window.",
                                    "Cannot safely stop", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    RefreshStatus();
                    return;
                }
                if (MessageBox.Show(this, "Stop CrispASR now?\r\n\r\n" +
                                    "Any speech currently being generated will be interrupted.",
                                    "Stop local server", MessageBoxButtons.YesNo,
                                    MessageBoxIcon.Question, MessageBoxDefaultButton.Button2) != DialogResult.Yes)
                    return;
                try
                {
                    owned.Kill();
                    if (!owned.WaitForExit(3000))
                        throw new InvalidOperationException("The server did not exit within 3 seconds.");
                    if (File.Exists(managedFile)) File.Delete(managedFile);
                }
                catch (Exception ex)
                {
                    MessageBox.Show(this, "Could not stop the managed server:\r\n" + ex.Message,
                                    "Stop failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
            RefreshStatus();
        }

        private void OpenFolder()
        {
            string exe = pathInput.Text.Trim().Trim('"');
            if (!File.Exists(exe))
            {
                MessageBox.Show(this, "Choose your working crispasr.exe first.",
                                "Folder unavailable", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            try { Process.Start(Path.GetDirectoryName(Path.GetFullPath(exe))); }
            catch (Exception ex)
            {
                MessageBox.Show(this, ex.Message, "Open folder failed",
                                MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
    }
}
