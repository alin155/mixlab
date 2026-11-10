using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace MixLabRepairTool
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new RepairForm());
        }
    }

    public class RepairForm : Form
    {
        private static readonly string[] MixLabProcessNames = new string[]
        {
            "MixLab Cutter",
            "mixlab-cutter-desktop",
            "cutter-api-sidecar-x86_64-pc-windows-msvc",
            "mixlab-searchd-x86_64-pc-windows-msvc"
        };

        private readonly Label statusLabel;
        private readonly RichTextBox logBox;
        private readonly Button repairButton;
        private readonly Button diagnosticsButton;
        private readonly Button rollbackButton;
        private readonly object logLock = new object();
        private readonly List<string> operationLog = new List<string>();
        private bool busy;
        private string lastStagingDirectory;

        public RepairForm()
        {
            Text = "MixLab Cutter 修复工具";
            ClientSize = new Size(680, 470);
            MinimumSize = new Size(680, 470);
            MaximumSize = new Size(680, 470);
            MaximizeBox = false;
            FormBorderStyle = FormBorderStyle.FixedSingle;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(246, 248, 252);
            Font = new Font("Microsoft YaHei UI", 10F);

            Label title = new Label();
            title.Text = "MixLab Cutter 修复工具";
            title.Font = new Font("Microsoft YaHei UI", 17F, FontStyle.Bold);
            title.ForeColor = Color.FromArgb(28, 42, 66);
            title.AutoSize = true;
            title.Location = new Point(24, 20);
            Controls.Add(title);

            Label hint = new Label();
            hint.Text = "升级后工作台一直加载时，点一次“一键修复”即可。";
            hint.ForeColor = Color.FromArgb(90, 103, 122);
            hint.AutoSize = true;
            hint.Location = new Point(27, 62);
            Controls.Add(hint);

            statusLabel = new Label();
            statusLabel.Text = "准备就绪";
            statusLabel.Font = new Font("Microsoft YaHei UI", 11F, FontStyle.Bold);
            statusLabel.ForeColor = Color.FromArgb(38, 102, 196);
            statusLabel.AutoEllipsis = true;
            statusLabel.Location = new Point(27, 98);
            statusLabel.Size = new Size(620, 30);
            Controls.Add(statusLabel);

            repairButton = new Button();
            repairButton.Text = "一键修复";
            repairButton.Font = new Font("Microsoft YaHei UI", 12F, FontStyle.Bold);
            repairButton.BackColor = Color.FromArgb(49, 112, 224);
            repairButton.ForeColor = Color.White;
            repairButton.FlatStyle = FlatStyle.Flat;
            repairButton.FlatAppearance.BorderSize = 0;
            repairButton.Location = new Point(27, 142);
            repairButton.Size = new Size(180, 48);
            repairButton.Click += RepairButton_Click;
            Controls.Add(repairButton);

            diagnosticsButton = new Button();
            diagnosticsButton.Text = "只导出诊断包";
            diagnosticsButton.Location = new Point(222, 142);
            diagnosticsButton.Size = new Size(150, 48);
            diagnosticsButton.Click += DiagnosticsButton_Click;
            Controls.Add(diagnosticsButton);

            rollbackButton = new Button();
            rollbackButton.Text = "回退到 0.18.27";
            rollbackButton.Location = new Point(387, 142);
            rollbackButton.Size = new Size(160, 48);
            rollbackButton.Click += RollbackButton_Click;
            Controls.Add(rollbackButton);

            logBox = new RichTextBox();
            logBox.Location = new Point(27, 210);
            logBox.Size = new Size(626, 230);
            logBox.ReadOnly = true;
            logBox.BackColor = Color.White;
            logBox.BorderStyle = BorderStyle.FixedSingle;
            logBox.Font = new Font("Consolas", 9F);
            logBox.DetectUrls = false;
            Controls.Add(logBox);

            Log("工具已打开。建议先保存好当前工作，再点“一键修复”。");
        }

        private void RepairButton_Click(object sender, EventArgs e)
        {
            if (busy) return;
            SetBusy(true);
            SetStatus("正在准备…");
            Thread worker = new Thread(delegate()
            {
                string staging = null;
                try
                {
                    staging = PreserveLogs();
                    lastStagingDirectory = staging;
                    string cutter = FindCutterExecutable();
                    if (string.IsNullOrEmpty(cutter))
                    {
                        throw new InvalidOperationException("未找到 MixLab Cutter");
                    }
                    Log("已找到 Cutter：" + cutter);
                    SetStatus("正在结束残留进程…");
                    KillMixLabProcesses();
                    Thread.Sleep(3000);
                    List<int> portOwners = FindPortListeners(3789).Concat(FindPortListeners(3790)).Distinct().ToList();
                    if (portOwners.Count > 0)
                    {
                        string ownerText = DescribePortOwners(portOwners);
                        throw new InvalidOperationException("端口被其他程序占用：" + ownerText);
                    }
                    SetStatus("正在重启 Cutter…");
                    ProcessStartInfo start = new ProcessStartInfo();
                    start.FileName = cutter;
                    start.WorkingDirectory = Path.GetDirectoryName(cutter);
                    start.UseShellExecute = true;
                    Process.Start(start);
                    bool ready = WaitForHealthy(cutter, 90);
                    if (!ready)
                    {
                        throw new InvalidOperationException("本机服务在 90 秒内没有恢复");
                    }
                    Thread.Sleep(5000);
                    if (!IsCutterRunning(cutter) || !HealthOk(3789) || !HealthOk(3790))
                    {
                        throw new InvalidOperationException("服务恢复后状态又发生变化");
                    }
                    SetStatus("修复完成，请回到 MixLab Cutter 查看工作台是否已加载");
                    Log("修复完成。");
                    if (!string.IsNullOrEmpty(staging))
                    {
                        try { Directory.Delete(staging, true); } catch { }
                    }
                    ShowInfo("修复完成，请回到 MixLab Cutter 查看工作台是否已加载。");
                }
                catch (Exception ex)
                {
                    Log("修复未完成：" + ex.Message);
                    SetStatus("自动修复未完成，正在导出诊断包…");
                    string path = "";
                    try
                    {
                        path = CreateDiagnostics(ex.Message, staging);
                    }
                    catch (Exception diagnosticError)
                    {
                        Log("诊断包生成失败：" + diagnosticError.Message);
                    }
                    SetStatus("自动修复未完成，请把诊断包发给管理员");
                    ShowInfo("自动修复未完成。\r\n\r\n诊断包位置：\r\n" + (string.IsNullOrEmpty(path) ? "生成失败，请联系管理员" : path));
                }
                finally
                {
                    SetBusy(false);
                }
            });
            worker.IsBackground = true;
            worker.Start();
        }

        private void DiagnosticsButton_Click(object sender, EventArgs e)
        {
            if (busy) return;
            SetBusy(true);
            SetStatus("正在导出诊断包…");
            Thread worker = new Thread(delegate()
            {
                try
                {
                    string staging = PreserveLogs();
                    string path = CreateDiagnostics("用户手动导出诊断包", staging);
                    SetStatus("诊断包已保存");
                    Log("诊断包：" + path);
                    ShowInfo("诊断包已生成：\r\n" + path);
                }
                catch (Exception ex)
                {
                    SetStatus("诊断包生成失败");
                    Log("诊断包生成失败：" + ex.Message);
                    ShowInfo("诊断包生成失败：" + ex.Message);
                }
                finally
                {
                    SetBusy(false);
                }
            });
            worker.IsBackground = true;
            worker.Start();
        }

        private void RollbackButton_Click(object sender, EventArgs e)
        {
            if (busy) return;
            DialogResult confirm = MessageBox.Show(
                "回退会先关闭 MixLab Cutter，并打开 0.18.27 安装包。\r\n不会删除素材或项目，也不会自动静默降级。\r\n\r\n确定继续吗？",
                "确认回退",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning,
                MessageBoxDefaultButton.Button2);
            if (confirm != DialogResult.Yes) return;
            SetBusy(true);
            SetStatus("正在准备回退…");
            Thread worker = new Thread(delegate()
            {
                try
                {
                    KillMixLabProcesses();
                    Thread.Sleep(2000);
                    string folder = @"\\192.168.1.27\MixLab\安装包\MixLab Cutter\0.18.27";
                    string installer = FindInstaller(folder);
                    if (string.IsNullOrEmpty(installer))
                    {
                        throw new InvalidOperationException("未找到 0.18.27 安装包，请检查 NAS 连接");
                    }
                    ProcessStartInfo start = new ProcessStartInfo();
                    start.FileName = installer;
                    start.UseShellExecute = true;
                    Process.Start(start);
                    SetStatus("已打开 0.18.27 安装包，请按向导完成安装");
                    Log("已打开安装包：" + installer);
                    ShowInfo("已打开 0.18.27 安装包，请按向导完成安装。");
                }
                catch (Exception ex)
                {
                    SetStatus("无法打开回退安装包");
                    Log("回退失败：" + ex.Message);
                    ShowInfo("无法打开回退安装包：" + ex.Message);
                }
                finally
                {
                    SetBusy(false);
                }
            });
            worker.IsBackground = true;
            worker.Start();
        }

        private static string FindInstaller(string folder)
        {
            try
            {
                if (!Directory.Exists(folder)) return null;
                string[] files = Directory.GetFiles(folder, "*.exe");
                string best = null;
                DateTime bestTime = DateTime.MinValue;
                foreach (string file in files)
                {
                    DateTime time = File.GetLastWriteTime(file);
                    if (time > bestTime)
                    {
                        best = file;
                        bestTime = time;
                    }
                }
                return best;
            }
            catch { return null; }
        }

        private string PreserveLogs()
        {
            string staging = Path.Combine(Path.GetTempPath(), "MixLab-Cutter-Repair-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(staging);
            string logSource = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "MixLab Cutter", "logs");
            string configSource = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "MixLab Cutter", "cutter-desktop-config.json");
            string configSource2 = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "com.mixlab.cutter", "cutter-desktop-config.json");
            try
            {
                if (Directory.Exists(logSource))
                {
                    CopyDirectory(logSource, Path.Combine(staging, "logs"));
                }
                if (File.Exists(configSource)) CopySanitizedFile(configSource, Path.Combine(staging, "cutter-desktop-config.json"));
                if (File.Exists(configSource2)) CopySanitizedFile(configSource2, Path.Combine(staging, "cutter-desktop-config.json"));
            }
            catch (Exception ex)
            {
                Log("保存日志时出现问题：" + ex.Message);
            }
            return staging;
        }

        private static void CopyDirectory(string source, string destination)
        {
            Directory.CreateDirectory(destination);
            foreach (string file in Directory.GetFiles(source))
            {
                string target = Path.Combine(destination, Path.GetFileName(file));
                try
                {
                    CopySanitizedFile(file, target);
                }
                catch { }
            }
            foreach (string folder in Directory.GetDirectories(source))
            {
                CopyDirectory(folder, Path.Combine(destination, Path.GetFileName(folder)));
            }
        }

        private static void CopySanitizedFile(string source, string destination)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(destination));
            string extension = Path.GetExtension(source).ToLowerInvariant();
            if (extension == ".log" || extension == ".ndjson" || extension == ".txt" || extension == ".json")
            {
                string text = File.ReadAllText(source, Encoding.UTF8);
                text = Sanitize(text);
                File.WriteAllText(destination, text, Encoding.UTF8);
            }
            else
            {
                File.Copy(source, destination, true);
            }
        }

        private static string Sanitize(string text)
        {
            if (string.IsNullOrEmpty(text)) return text;
            string[] lines = text.Replace("\r\n", "\n").Split('\n');
            StringBuilder output = new StringBuilder();
            foreach (string line in lines)
            {
                if (ContainsSensitiveKey(line))
                {
                    output.AppendLine("[REDACTED]");
                }
                else
                {
                    output.AppendLine(line);
                }
            }
            return output.ToString();
        }

        private static bool ContainsSensitiveKey(string text)
        {
            string[] keys = new string[] { "session_token", "password", "token", "secret", "cookie", "authorization" };
            foreach (string key in keys)
            {
                if (text.IndexOf(key, StringComparison.OrdinalIgnoreCase) >= 0) return true;
            }
            return false;
        }

        private static string FindCutterExecutable()
        {
            foreach (string name in new string[] { "MixLab Cutter", "mixlab-cutter-desktop" })
            {
                try
                {
                    foreach (Process process in Process.GetProcessesByName(name))
                    {
                        try
                        {
                            string path = process.MainModule.FileName;
                            if (!string.IsNullOrEmpty(path) && File.Exists(path)) return path;
                        }
                        catch { }
                    }
                }
                catch { }
            }

            string fromRegistry = FindCutterFromRegistry();
            if (!string.IsNullOrEmpty(fromRegistry)) return fromRegistry;

            string local = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "MixLab Cutter");
            string[] localNames = new string[] { "mixlab-cutter-desktop.exe", "MixLab Cutter.exe" };
            foreach (string name in localNames)
            {
                string candidate = Path.Combine(local, name);
                if (File.Exists(candidate)) return candidate;
            }

            string programFiles = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "MixLab Cutter");
            foreach (string name in localNames)
            {
                string candidate = Path.Combine(programFiles, name);
                if (File.Exists(candidate)) return candidate;
            }
            return null;
        }

        private static string FindCutterFromRegistry()
        {
            try
            {
                foreach (RegistryHive hive in new RegistryHive[] { RegistryHive.CurrentUser, RegistryHive.LocalMachine })
                {
                    foreach (RegistryView view in new RegistryView[] { RegistryView.Registry64, RegistryView.Registry32 })
                    {
                        using (RegistryKey baseKey = RegistryKey.OpenBaseKey(hive, view))
                        using (RegistryKey uninstall = baseKey.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"))
                        {
                            if (uninstall == null) continue;
                            foreach (string subName in uninstall.GetSubKeyNames())
                            {
                                using (RegistryKey app = uninstall.OpenSubKey(subName))
                                {
                                    if (app == null) continue;
                                    object display = app.GetValue("DisplayName");
                                    if (display == null || display.ToString().IndexOf("MixLab Cutter", StringComparison.OrdinalIgnoreCase) < 0) continue;
                                    object location = app.GetValue("InstallLocation");
                                    if (location == null) continue;
                                    string folder = location.ToString().Trim().Trim('"');
                                    foreach (string name in new string[] { "mixlab-cutter-desktop.exe", "MixLab Cutter.exe" })
                                    {
                                        string candidate = Path.Combine(folder, name);
                                        if (File.Exists(candidate)) return candidate;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            catch { }
            return null;
        }

        private static bool IsCutterRunning(string cutterPath)
        {
            try
            {
                foreach (Process process in Process.GetProcesses())
                {
                    try
                    {
                        string path = process.MainModule.FileName;
                        if (!string.IsNullOrEmpty(path) && string.Equals(path, cutterPath, StringComparison.OrdinalIgnoreCase)) return true;
                    }
                    catch { }
                }
            }
            catch { }
            return false;
        }

        private static void KillMixLabProcesses()
        {
            foreach (string name in MixLabProcessNames)
            {
                Process[] processes;
                try { processes = Process.GetProcessesByName(name); }
                catch { continue; }
                foreach (Process process in processes)
                {
                    try { RunHidden("taskkill.exe", "/PID " + process.Id + " /T /F"); }
                    catch { try { process.Kill(); } catch { } }
                }
            }
        }

        private static void RunHidden(string file, string arguments)
        {
            ProcessStartInfo info = new ProcessStartInfo();
            info.FileName = file;
            info.Arguments = arguments;
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.WindowStyle = ProcessWindowStyle.Hidden;
            Process.Start(info);
        }

        private static List<int> FindPortListeners(int port)
        {
            List<int> owners = new List<int>();
            try
            {
                ProcessStartInfo info = new ProcessStartInfo();
                info.FileName = "netstat.exe";
                info.Arguments = "-ano";
                info.UseShellExecute = false;
                info.CreateNoWindow = true;
                info.RedirectStandardOutput = true;
                using (Process process = Process.Start(info))
                {
                    string output = process.StandardOutput.ReadToEnd();
                    process.WaitForExit(3000);
                    string token = ":" + port;
                    foreach (string line in output.Split(new char[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
                    {
                        if (line.IndexOf(token, StringComparison.Ordinal) < 0 || line.IndexOf("LISTENING", StringComparison.OrdinalIgnoreCase) < 0) continue;
                        string[] parts = line.Split(new char[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                        if (parts.Length < 5) continue;
                        int pid;
                        if (int.TryParse(parts[parts.Length - 1], out pid)) owners.Add(pid);
                    }
                }
            }
            catch { }
            return owners.Distinct().ToList();
        }

        private static string DescribePortOwners(List<int> pids)
        {
            List<string> text = new List<string>();
            foreach (int pid in pids)
            {
                try
                {
                    Process process = Process.GetProcessById(pid);
                    text.Add(process.ProcessName + "(" + pid + ")");
                }
                catch { text.Add("PID " + pid); }
            }
            return string.Join(", ", text.ToArray());
        }

        private static bool HealthOk(int port)
        {
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + port + "/health");
                request.Timeout = 2000;
                request.ReadWriteTimeout = 2000;
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                {
                    return (int)response.StatusCode == 200;
                }
            }
            catch { return false; }
        }

        private bool WaitForHealthy(string cutterPath, int seconds)
        {
            int attempts = seconds / 2;
            for (int index = 0; index < attempts; index++)
            {
                SetStatus("正在等待本机服务恢复（" + (index * 2) + "/" + seconds + " 秒）…");
                if (IsCutterRunning(cutterPath) && HealthOk(3789) && HealthOk(3790)) return true;
                Thread.Sleep(2000);
            }
            return IsCutterRunning(cutterPath) && HealthOk(3789) && HealthOk(3790);
        }

        private string CreateDiagnostics(string reason, string staging)
        {
            string computer = Environment.MachineName;
            string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            string temp = Path.Combine(Path.GetTempPath(), "MixLab-Cutter-Diagnostics-" + Guid.NewGuid().ToString("N"));
            string logs = Path.Combine(temp, "logs");
            Directory.CreateDirectory(logs);
            try
            {
                if (!string.IsNullOrEmpty(staging) && Directory.Exists(Path.Combine(staging, "logs")))
                {
                    CopyDirectory(Path.Combine(staging, "logs"), logs);
                }
                else
                {
                    string currentLogs = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "MixLab Cutter", "logs");
                    if (Directory.Exists(currentLogs)) CopyDirectory(currentLogs, logs);
                }
                string[] configSources = new string[]
                {
                    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "MixLab Cutter", "cutter-desktop-config.json"),
                    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "com.mixlab.cutter", "cutter-desktop-config.json")
                };
                foreach (string source in configSources)
                {
                    if (File.Exists(source))
                    {
                        CopySanitizedFile(source, Path.Combine(temp, "cutter-desktop-config.json"));
                        break;
                    }
                }

                StringBuilder text = new StringBuilder();
                text.AppendLine("MixLab Cutter 诊断包");
                text.AppendLine("生成时间：" + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));
                text.AppendLine("电脑名：" + computer);
                text.AppendLine("用户：" + Environment.UserName);
                text.AppendLine("系统：" + Environment.OSVersion.VersionString);
                text.AppendLine("原因：" + reason);
                string cutter = FindCutterExecutable();
                text.AppendLine("Cutter 路径：" + (string.IsNullOrEmpty(cutter) ? "未找到" : cutter));
                if (!string.IsNullOrEmpty(cutter) && File.Exists(cutter))
                {
                    try { text.AppendLine("Cutter 版本：" + FileVersionInfo.GetVersionInfo(cutter).FileVersion); }
                    catch { }
                }
                text.AppendLine("3789 health：" + (HealthOk(3789) ? "200" : "失败"));
                text.AppendLine("3790 health：" + (HealthOk(3790) ? "200" : "失败"));
                text.AppendLine("磁盘：" + string.Join(", ", DriveInfo.GetDrives().Select(delegate(DriveInfo drive) { return drive.Name + " " + drive.DriveType; }).ToArray()));
                text.AppendLine("NAS：" + @"\\192.168.1.27\MixLab");
                text.AppendLine();
                text.AppendLine("进程快照：");
                foreach (string processName in MixLabProcessNames)
                {
                    try
                    {
                        foreach (Process process in Process.GetProcessesByName(processName))
                        {
                            text.AppendLine("  " + process.ProcessName + " PID=" + process.Id);
                        }
                    }
                    catch { }
                }
                text.AppendLine();
                text.AppendLine("端口占用：");
                text.AppendLine("  3789=" + DescribePortOwners(FindPortListeners(3789)));
                text.AppendLine("  3790=" + DescribePortOwners(FindPortListeners(3790)));
                text.AppendLine();
                text.AppendLine("操作日志：");
                lock (logLock)
                {
                    foreach (string line in operationLog) text.AppendLine(line);
                }
                File.WriteAllText(Path.Combine(temp, "diagnostics.txt"), "\uFEFF" + text.ToString(), Encoding.UTF8);

                string stamp = DateTime.Now.ToString("yyyyMMdd-HHmmss");
                string zipName = "MixLab-Cutter-Diagnostics-" + computer + "-" + stamp + ".zip";
                string zipPath = Path.Combine(desktop, zipName);
                if (File.Exists(zipPath)) File.Delete(zipPath);
                ZipFile.CreateFromDirectory(temp, zipPath, CompressionLevel.Optimal, false);
                string nasPath = @"\\192.168.1.27\MixLab\CutterDiagnostics\" + computer;
                string nasStatus;
                try
                {
                    Directory.CreateDirectory(nasPath);
                    File.Copy(zipPath, Path.Combine(nasPath, zipName), true);
                    nasStatus = "已上传到 NAS：" + nasPath;
                }
                catch (Exception ex)
                {
                    nasStatus = "NAS 不可写（诊断包仍在桌面）：" + ex.Message;
                }
                Log("诊断包：" + zipPath + "；" + nasStatus);
                return zipPath + "\r\n" + nasStatus;
            }
            finally
            {
                try { Directory.Delete(temp, true); } catch { }
            }
        }

        private void SetBusy(bool value)
        {
            SafeUi(delegate()
            {
                busy = value;
                repairButton.Enabled = !value;
                diagnosticsButton.Enabled = !value;
                rollbackButton.Enabled = !value;
                UseWaitCursor = value;
            });
        }

        private void SetStatus(string value)
        {
            SafeUi(delegate() { statusLabel.Text = value; });
            AddLog(value);
        }

        private void Log(string value)
        {
            AddLog(value);
            SafeUi(delegate()
            {
                logBox.AppendText("[" + DateTime.Now.ToString("HH:mm:ss") + "] " + value + "\r\n");
                logBox.SelectionStart = logBox.TextLength;
                logBox.ScrollToCaret();
            });
        }

        private void AddLog(string value)
        {
            lock (logLock)
            {
                operationLog.Add(DateTime.Now.ToString("HH:mm:ss") + " " + value);
            }
        }

        private void ShowInfo(string text)
        {
            SafeUi(delegate() { MessageBox.Show(this, text, "MixLab Cutter 修复工具", MessageBoxButtons.OK, MessageBoxIcon.Information); });
        }

        private void SafeUi(Action action)
        {
            if (InvokeRequired) BeginInvoke(action);
            else action();
        }
    }
}
