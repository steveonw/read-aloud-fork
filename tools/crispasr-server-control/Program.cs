// Optional portable local server controller for Read-Aloud M4.
// Windows 10+, .NET Framework 4.x. Does NOT install, alter, or update CrispASR.
// It starts only the user's existing crispasr.exe with the proven CosyVoice flags.
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
            var valid = ServerWindow.MakeArguments().Contains("--backend cosyvoice3-tts-rl")
                && ServerWindow.MakeArguments().Contains("--host 127.0.0.1 --port 18080")
                && !ServerWindow.MakeArguments().Contains("--no-watermark")
                && !ServerWindow.MakeArguments().Contains("--no-c2pa");
            var h = ServerWindow.ParseHealth("{\"status\":\"ok\",\"backend\":\"cosyvoice3-tts-rl\"}");
            var other = ServerWindow.ParseHealth("{\"status\":\"error\",\"backend\":\"cosyvoice3-tts-rl\"}");
            valid = valid && h == "cosyvoice3-tts-rl" && other == null;
            return valid ? 0 : 1;
        }
    }

    internal sealed class ServerWindow : Form
    {
        private const string LocalHealthUrl = "http://127.0.0.1:18080/health";
        private readonly string stateDirectory;
        private readonly string managedFile;
        private readonly string settingsFile;
        private readonly TextBox pathInput;
        private readonly Label status;
        private readonly Label note;
        private readonly Button startButton;
        private readonly Button stopButton;
        private readonly Timer refreshTimer;
        private bool busy;

        public static string MakeArguments()
        {
            return "--server --backend cosyvoice3-tts-rl -m auto " +
                   "--voice fleurs-en --i-have-rights --host 127.0.0.1 --port 18080";
        }

        public ServerWindow()
        {
            Text = "CrispASR Server Control - Read-Aloud";
            ClientSize = new Size(658, 317);
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

            Label title = new Label();
            title.Text = "CrispASR - Local Speech Server";
            title.Font = new Font("Segoe UI", 15F, FontStyle.Bold);
            title.Location = new Point(22, 15);
            title.Size = new Size(610, 33);
            Controls.Add(title);

            Label subtitle = new Label();
            subtitle.Text = "Start or stop your existing CosyVoice 3 server without Git Bash.";
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

            status = new Label();
            status.Text = "Checking...";
            status.Location = new Point(23, 155);
            status.Size = new Size(610, 24);
            status.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
            status.ForeColor = Color.FromArgb(78, 86, 102);
            Controls.Add(status);

            note = new Label();
            note.Text = "Server address: 127.0.0.1:18080";
            note.Location = new Point(23, 180);
            note.Size = new Size(615, 28);
            Controls.Add(note);

            startButton = new Button();
            startButton.Text = "Start server";
            startButton.Location = new Point(23, 218);
            startButton.Size = new Size(138, 38);
            startButton.BackColor = Color.FromArgb(216, 231, 255);
            startButton.Click += delegate { StartServer(); };
            Controls.Add(startButton);

            stopButton = new Button();
            stopButton.Text = "Stop server";
            stopButton.Location = new Point(172, 218);
            stopButton.Size = new Size(138, 38);
            stopButton.Click += delegate { StopServer(); };
            Controls.Add(stopButton);

            Button refresh = new Button();
            refresh.Text = "Refresh";
            refresh.Location = new Point(322, 218);
            refresh.Size = new Size(118, 38);
            refresh.Click += delegate { RefreshStatus(); };
            Controls.Add(refresh);

            Button openDir = new Button();
            openDir.Text = "Open folder";
            openDir.Location = new Point(451, 218);
            openDir.Size = new Size(185, 38);
            openDir.Click += delegate { OpenFolder(); };
            Controls.Add(openDir);

            Label footer = new Label();
            footer.Text = "You can close this controller while the server runs. Reopen it to stop the server.";
            footer.Location = new Point(23, 275);
            footer.Size = new Size(615, 26);
            footer.ForeColor = Color.FromArgb(87, 95, 107);
            Controls.Add(footer);

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
                        Display("Stopped", "Press Start server to load your existing CosyVoice 3 GGUF model.",
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
                !string.Equals(Path.GetFileName(exe), "crispasr.exe",
                               StringComparison.OrdinalIgnoreCase))
            {
                MessageBox.Show(this, "Select your existing crispasr.exe first.",
                                "Executable not found", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            using (Process existing = OwnedProcess())
            {
                if (existing != null || GetHealth() != null || PortOccupied())
                {
                    MessageBox.Show(this, "Port 18080 is already in use or your server is starting. " +
                                  "Do not run a second server on the same port.",
                                    "Already running", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    RefreshStatus();
                    return;
                }
            }

            try
            {
                ProcessStartInfo info = new ProcessStartInfo();
                info.FileName = Path.GetFullPath(exe);
                info.Arguments = MakeArguments();
                info.WorkingDirectory = Path.GetDirectoryName(info.FileName);
                // A minimized native console keeps error messages available
                // even after the small controller itself has been closed.
                info.UseShellExecute = true;
                info.WindowStyle = ProcessWindowStyle.Minimized;
                using (Process started = Process.Start(info))
                {
                    if (started == null) throw new InvalidOperationException("Could not start the server.");
                    StoreOwned(started, info.FileName);
                }
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
