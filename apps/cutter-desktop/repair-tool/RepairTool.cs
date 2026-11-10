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
using System.Net.NetworkInformation;
using System.Reflection;
using System.Security.Cryptography;

[assembly: AssemblyVersion("1.3.0.0")]
[assembly: AssemblyFileVersion("1.3.0.0")]
[assembly: AssemblyInformationalVersion("1.3.0")]

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

    public class DiagnosticsSubmission
    {
        public string Id;
        public string ZipPath;
        public string PendingPath;
        public bool Submitted;
        public bool Queued;
    }

    internal sealed class RepairAction
    {
        public string action;
        public bool ok;
        public string error;
    }

    internal sealed class RepairDiagnosis
    {
        public string Code;
        public bool NeedsAdmin;
        public string Detail;
    }

    internal sealed class RepairNeedsAdminException : Exception
    {
        public RepairNeedsAdminException(string message) : base(message) { }
    }


    internal sealed class RoundedPanel : Panel
    {
        public int Radius = 18;
        public RoundedPanel()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw | ControlStyles.SupportsTransparentBackColor, true);
            BackColor = Color.Transparent;
            DoubleBuffered = true;
        }
        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);
            UpdateRegion();
        }
        private void UpdateRegion()
        {
            if (Width <= 0 || Height <= 0) return;
            using (System.Drawing.Drawing2D.GraphicsPath path = new System.Drawing.Drawing2D.GraphicsPath())
            {
                int radius = Math.Min(Radius, Math.Min(Width, Height) / 2);
                path.AddArc(0, 0, radius * 2, radius * 2, 180, 90);
                path.AddArc(Width - radius * 2, 0, radius * 2, radius * 2, 270, 90);
                path.AddArc(Width - radius * 2, Height - radius * 2, radius * 2, radius * 2, 0, 90);
                path.AddArc(0, Height - radius * 2, radius * 2, radius * 2, 90, 90);
                path.CloseFigure();
                Region = new Region(path);
            }
        }
        protected override void OnPaint(PaintEventArgs e)
        {
            using (System.Drawing.Drawing2D.GraphicsPath path = new System.Drawing.Drawing2D.GraphicsPath())
            {
                int radius = Math.Min(Radius, Math.Min(Width, Height) / 2);
                path.AddArc(0, 0, radius * 2, radius * 2, 180, 90);
                path.AddArc(Width - radius * 2, 0, radius * 2, radius * 2, 270, 90);
                path.AddArc(Width - radius * 2, Height - radius * 2, radius * 2, radius * 2, 0, 90);
                path.AddArc(0, Height - radius * 2, radius * 2, radius * 2, 90, 90);
                path.CloseFigure();
                using (SolidBrush brush = new SolidBrush(Color.White)) e.Graphics.FillPath(brush, path);
                using (Pen pen = new Pen(Color.FromArgb(232, 237, 245), 1f)) e.Graphics.DrawPath(pen, path);
            }
        }
    }

    internal sealed class RoundButton : Button
    {
        public RoundButton()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
            FlatStyle = FlatStyle.Flat;
            FlatAppearance.BorderSize = 0;
            BackColor = Color.FromArgb(42, 106, 224);
            ForeColor = Color.White;
            UseVisualStyleBackColor = false;
            TabStop = false;
        }
        protected override void OnPaint(PaintEventArgs e)
        {
            using (SolidBrush clear = new SolidBrush(Parent == null ? Color.Transparent : Parent.BackColor)) e.Graphics.FillRectangle(clear, ClientRectangle);
            using (System.Drawing.Drawing2D.GraphicsPath path = new System.Drawing.Drawing2D.GraphicsPath())
            {
                int radius = 12;
                path.AddArc(0, 0, radius * 2, radius * 2, 180, 90);
                path.AddArc(Width - radius * 2, 0, radius * 2, radius * 2, 270, 90);
                path.AddArc(Width - radius * 2, Height - radius * 2, radius * 2, radius * 2, 0, 90);
                path.AddArc(0, Height - radius * 2, radius * 2, radius * 2, 90, 90);
                path.CloseFigure();
                using (SolidBrush brush = new SolidBrush(Enabled ? BackColor : Color.FromArgb(190, 202, 219))) e.Graphics.FillPath(brush, path);
            }
            TextRenderer.DrawText(e.Graphics, Text, Font, ClientRectangle, ForeColor, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
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

        private readonly RichTextBox logBox;
        private readonly Button repairButton;
        private readonly Button diagnosticsButton;
        private readonly Button rollbackButton;
        private readonly RoundedPanel card;
        private readonly Label stateIconLabel;
        private readonly Label stateTitleLabel;
        private readonly Label stateDetailLabel;
        private readonly Label[] stepLabels;
        private readonly Button moreLink;
        private readonly LinkLabel logToggle;
        private readonly object logLock = new object();
        private const string ToolVersion = "1.3.0";
        private static readonly string FeedbackInbox = @"\\192.168.1.27\MixLab\CutterFeedback\inbox";
        private static readonly object QueueLock = new object();
        private static bool queueRunning;
        private readonly List<string> operationLog = new List<string>();
        private readonly object operationLogLock = new object();
        private readonly System.Windows.Forms.Timer retryTimer;
        private bool busy;
        private string lastStagingDirectory;
        private readonly List<RepairAction> repairActions = new List<RepairAction>();
        private string currentDiagnosis = "unknown";
        private bool currentNeedsAdmin;

        public RepairForm()
        {
            AutoScaleMode = AutoScaleMode.Dpi;
            Text = "MixLab Cutter 修复工具";
            ClientSize = new Size(760, 560);
            MinimumSize = new Size(760, 560);
            MaximumSize = new Size(760, 900);
            MaximizeBox = false;
            FormBorderStyle = FormBorderStyle.FixedSingle;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(244, 247, 252);
            Font = new Font("Microsoft YaHei UI", 10F);

            Label brand = new Label();
            brand.Text = "ML";
            brand.TextAlign = ContentAlignment.MiddleCenter;
            brand.Font = new Font("Microsoft YaHei UI", 10F, FontStyle.Bold);
            brand.ForeColor = Color.White;
            brand.BackColor = Color.FromArgb(42, 106, 224);
            brand.Location = new Point(32, 24);
            brand.Size = new Size(34, 34);
            Controls.Add(brand);

            Label title = new Label();
            title.Text = "修复工具";
            title.Font = new Font("Microsoft YaHei UI", 19F, FontStyle.Bold);
            title.ForeColor = Color.FromArgb(26, 40, 64);
            title.AutoSize = true;
            title.Location = new Point(78, 20);
            Controls.Add(title);

            Label subtitle = new Label();
            subtitle.Text = "工作台加载异常时，帮助你安全恢复本机引擎。";
            subtitle.ForeColor = Color.FromArgb(96, 109, 128);
            subtitle.AutoSize = true;
            subtitle.Location = new Point(34, 68);
            Controls.Add(subtitle);

            Label version = new Label();
            version.Text = "v1.3.0";
            version.TextAlign = ContentAlignment.MiddleCenter;
            version.ForeColor = Color.FromArgb(42, 106, 224);
            version.BackColor = Color.FromArgb(232, 240, 255);
            version.Font = new Font("Microsoft YaHei UI", 9F);
            version.Location = new Point(670, 28);
            version.Size = new Size(58, 24);
            Controls.Add(version);

            card = new RoundedPanel();
            card.Bounds = new Rectangle(32, 100, 696, 300);
            card.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            card.Padding = new Padding(0);
            Controls.Add(card);

            stateIconLabel = new Label();
            stateIconLabel.Text = "✓";
            stateIconLabel.TextAlign = ContentAlignment.MiddleCenter;
            stateIconLabel.Font = new Font("Microsoft YaHei UI", 16F, FontStyle.Bold);
            stateIconLabel.ForeColor = Color.FromArgb(31, 148, 92);
            stateIconLabel.BackColor = Color.FromArgb(232, 246, 238);
            stateIconLabel.Bounds = new Rectangle(28, 26, 44, 44);
            card.Controls.Add(stateIconLabel);

            stateTitleLabel = new Label();
            stateTitleLabel.Text = "准备就绪";
            stateTitleLabel.Font = new Font("Microsoft YaHei UI", 13F, FontStyle.Bold);
            stateTitleLabel.ForeColor = Color.FromArgb(26, 40, 64);
            stateTitleLabel.AutoSize = true;
            stateTitleLabel.Location = new Point(88, 24);
            card.Controls.Add(stateTitleLabel);

            stateDetailLabel = new Label();
            stateDetailLabel.Text = "将自动检查本机引擎、工作区与系统状态，并尝试安全修复。";
            stateDetailLabel.Font = new Font("Microsoft YaHei UI", 9F);
            stateDetailLabel.ForeColor = Color.FromArgb(110, 122, 140);
            stateDetailLabel.AutoSize = false;
            stateDetailLabel.Bounds = new Rectangle(88, 54, 570, 40);
            card.Controls.Add(stateDetailLabel);

            stepLabels = new Label[3];
            string[] stepTexts = new string[] { "① 检查环境", "② 安全修复", "③ 复检结果" };
            for (int index = 0; index < stepTexts.Length; index++)
            {
                Label step = new Label();
                step.Text = stepTexts[index];
                step.TextAlign = ContentAlignment.MiddleCenter;
                step.Font = new Font("Microsoft YaHei UI", 9F, FontStyle.Bold);
                step.ForeColor = Color.FromArgb(117, 132, 153);
                step.BackColor = Color.FromArgb(243, 246, 251);
                step.Bounds = new Rectangle(28 + index * 222, 100, 206, 34);
                card.Controls.Add(step);
                stepLabels[index] = step;
            }

            repairButton = new RoundButton();
            repairButton.Text = "一键修复";
            repairButton.Font = new Font("Microsoft YaHei UI", 11F, FontStyle.Bold);
            repairButton.BackColor = Color.FromArgb(42, 106, 224);
            repairButton.ForeColor = Color.White;
            repairButton.Bounds = new Rectangle(28, 152, 170, 48);
            repairButton.Click += RepairButton_Click;
            card.Controls.Add(repairButton);

            moreLink = new RoundButton();
            moreLink.Text = "更多选项  ⌄";
            moreLink.Font = new Font("Microsoft YaHei UI", 9F);
            moreLink.BackColor = Color.FromArgb(235, 241, 250);
            moreLink.ForeColor = Color.FromArgb(59, 82, 115);
            moreLink.Bounds = new Rectangle(218, 158, 118, 36);
            moreLink.Click += delegate { ShowMoreMenu(); };
            card.Controls.Add(moreLink);

            Label info = new Label();
            info.Text = "失败会自动提交诊断给管理员。不会删除素材、项目或缓存，不需要手动导出文件。";
            info.Font = new Font("Microsoft YaHei UI", 8.5F);
            info.ForeColor = Color.FromArgb(123, 135, 153);
            info.AutoSize = false;
            info.Bounds = new Rectangle(28, 216, 640, 24);
            card.Controls.Add(info);

            logToggle = new LinkLabel();
            logToggle.Text = "查看诊断日志";
            logToggle.Font = new Font("Microsoft YaHei UI", 8.5F);
            logToggle.LinkColor = Color.FromArgb(42, 106, 224);
            logToggle.AutoSize = true;
            logToggle.Location = new Point(28, 252);
            logToggle.LinkClicked += delegate { ToggleLog(); };
            card.Controls.Add(logToggle);

            logBox = new RichTextBox();
            logBox.Location = new Point(28, 292);
            logBox.Size = new Size(632, 220);
            logBox.ReadOnly = true;
            logBox.BackColor = Color.FromArgb(249, 251, 254);
            logBox.BorderStyle = BorderStyle.None;
            logBox.Font = new Font("Consolas", 8.5F);
            logBox.DetectUrls = false;
            logBox.Visible = false;
            card.Controls.Add(logBox);

            Label footerLeft = new Label();
            footerLeft.Text = "诊断与修复日志会保存在本机";
            footerLeft.Font = new Font("Microsoft YaHei UI", 8F);
            footerLeft.ForeColor = Color.FromArgb(137, 148, 164);
            footerLeft.AutoSize = true;
            footerLeft.Location = new Point(34, 500);
            Controls.Add(footerLeft);

            Label footerRight = new Label();
            footerRight.Text = "MixLab · Windows 桌面端";
            footerRight.Font = new Font("Microsoft YaHei UI", 8F);
            footerRight.ForeColor = Color.FromArgb(137, 148, 164);
            footerRight.AutoSize = true;
            footerRight.Location = new Point(574, 500);
            Controls.Add(footerRight);

            diagnosticsButton = new Button();
            diagnosticsButton.Visible = false;
            diagnosticsButton.Click += DiagnosticsButton_Click;
            rollbackButton = new Button();
            rollbackButton.Visible = false;
            rollbackButton.Click += RollbackButton_Click;
            logBox.Visible = false;

            retryTimer = new System.Windows.Forms.Timer();
            retryTimer.Interval = 300000;
            retryTimer.Tick += delegate { StartQueueFlush(); };
            retryTimer.Start();
            Shown += delegate { StartQueueFlush(); };
            NetworkChange.NetworkAvailabilityChanged += delegate { StartQueueFlush(); };

            Log("工具已打开。当前版本 " + ToolVersion + "，诊断包会自动提交给管理员。");
        }

        private void ToggleLog()
        {
            if (logBox == null) return;
            bool show = !logBox.Visible;
            logBox.Visible = show;
            logToggle.Text = show ? "收起诊断日志" : "查看诊断日志";
            if (show)
            {
                card.Height = 540;
                ClientSize = new Size(760, 760);
                logBox.Bounds = new Rectangle(28, 292, 632, 220);
            }
            else
            {
                card.Height = 300;
                ClientSize = new Size(760, 560);
            }
        }

        private void ShowMoreMenu()
        {
            ContextMenuStrip menu = new ContextMenuStrip();
            menu.Items.Add("导出诊断包（备用）", null, delegate { DiagnosticsButton_Click(null, EventArgs.Empty); });
            string previousVersion;
            string previousInstaller = FindPreviousInstaller(out previousVersion);
            if (!string.IsNullOrEmpty(previousInstaller))
            {
                menu.Items.Add("回退到 " + previousVersion, null, delegate { OpenInstaller(previousInstaller, previousVersion); });
            }
            menu.Items.Add("打开日志目录", null, delegate { OpenLogDirectory(); });
            menu.Show(moreLink, new Point(0, moreLink.Height));
        }

        private void OpenLogDirectory()
        {
            try
            {
                string logs = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "MixLab Cutter", "logs");
                Directory.CreateDirectory(logs);
                Process.Start("explorer.exe", logs);
            }
            catch (Exception error) { ShowInfo("无法打开日志目录：" + error.Message); }
        }

        private void OpenInstaller(string path, string version)
        {
            try
            {
                Process.Start(path);
                SetStatus("已打开回退安装包 " + version + "，请按向导完成安装");
            }
            catch (Exception error) { ShowInfo("无法打开回退安装包：" + error.Message); }
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
                    SetStatus("正在诊断故障类型…");
                    RepairDiagnosis diagnosis = DiagnoseBeforeRepair(cutter);
                    currentDiagnosis = diagnosis.Code;
                    currentNeedsAdmin = diagnosis.NeedsAdmin;
                    Log("诊断分类：" + diagnosis.Code + (string.IsNullOrEmpty(diagnosis.Detail) ? "" : "；" + diagnosis.Detail));
                    RecordAction("diagnose:" + diagnosis.Code, !diagnosis.NeedsAdmin, diagnosis.Detail);
                    if (diagnosis.NeedsAdmin)
                    {
                        throw new RepairNeedsAdminException("需要管理员介入：" + diagnosis.Detail);
                    }
                    if (diagnosis.Code == "unknown" && HealthOk(3789) && HealthOk(3790))
                    {
                        SetStatus("未发现需要修复的问题，本机服务健康");
                        ShowInfo("未发现需要修复的问题，本机服务健康。\r\n如需管理员查看，可点击“只导出诊断包”后提交。");
                        return;
                    }
                    SetStatus("正在结束残留进程…");
                    KillMixLabProcesses();
                    Thread.Sleep(3000);
                    List<int> portOwners = FindPortListeners(3789).Concat(FindPortListeners(3790)).Distinct().ToList();
                    if (portOwners.Count > 0)
                    {
                        string ownerText = DescribePortOwners(portOwners);
                        currentDiagnosis = "port_occupied";
                        currentNeedsAdmin = true;
                        RecordAction("detect_port_occupied", false, ownerText);
                        throw new RepairNeedsAdminException("端口被未知进程占用：" + ownerText);
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
                    if (ex is RepairNeedsAdminException) currentNeedsAdmin = true;
                    Log("修复未完成：" + ex.Message);
                    SetStatus("自动修复未完成，正在提交专家介入请求…");
                    DiagnosticsSubmission submission = null;
                    try
                    {
                        submission = CreateAndSubmitDiagnostics(ex.Message, staging, true, currentDiagnosis, repairActions, currentNeedsAdmin);
                    }
                    catch (Exception diagnosticError)
                    {
                        Log("诊断包生成失败：" + diagnosticError.Message);
                    }
                    if (submission != null && submission.Submitted)
                    {
                        SetStatus("已提交专家介入（编号 " + submission.Id + "），无需你手动发送");
                        ShowInfo("自动修复未完成。\r\n\r\n诊断已自动提交专家介入，编号：" + submission.Id + "\r\n无需你手动发送。\r\n\r\n桌面备份：" + submission.ZipPath);
                    }
                    else if (submission != null && submission.Queued)
                    {
                        SetStatus("已保存本机，恢复后自动提交（编号 " + submission.Id + "）");
                        ShowInfo("自动修复未完成。\r\n\r\n诊断已保存在本机，网络/共享恢复后会自动提交，编号：" + submission.Id + "\r\n无需你手动发送。\r\n\r\n桌面备份：" + submission.ZipPath);
                    }
                    else
                    {
                        SetStatus("自动修复未完成，请把桌面诊断包发给管理员");
                        ShowInfo("自动修复未完成。\r\n\r\n自动提交未成功，请把桌面诊断包发给管理员。");
                    }
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
                    DiagnosticsSubmission submission = CreateAndSubmitDiagnostics("用户手动导出诊断包", staging, false, "manual_export", repairActions, false);
                    SetStatus("诊断包已保存");
                    Log("诊断包：" + submission.ZipPath);
                    ShowInfo("诊断包已生成：\r\n" + submission.ZipPath);
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
            string version;
            string installer = FindPreviousInstaller(out version);
            if (string.IsNullOrEmpty(installer))
            {
                ShowInfo("未找到经过 SHA256 校验的上一版本安装包。\r\n本次不会自动降级，诊断会提交管理员处理。");
                return;
            }
            DialogResult confirm = MessageBox.Show(
                "将关闭 MixLab Cutter，并打开已验证的上一版本 " + version + " 安装包。\r\n不会删除素材或项目，也不会静默降级。\r\n\r\n确定继续吗？",
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
                    ProcessStartInfo start = new ProcessStartInfo();
                    start.FileName = installer;
                    start.UseShellExecute = true;
                    Process.Start(start);
                    SetStatus("已打开回退安装包 " + version + "，请按向导完成安装");
                    Log("已打开安装包：" + installer);
                    ShowInfo("已打开 " + version + " 安装包，请按向导完成安装。");
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

        private Version CurrentCutterVersion()
        {
            try
            {
                string cutter = FindCutterExecutable();
                if (string.IsNullOrEmpty(cutter)) return null;
                Version parsed;
                return Version.TryParse(FileVersionInfo.GetVersionInfo(cutter).FileVersion.Split(' ')[0], out parsed) ? parsed : null;
            }
            catch { return null; }
        }

        private string FindPreviousInstaller(out string previousVersion)
        {
            previousVersion = "";
            Version current = CurrentCutterVersion();
            if (current == null) return null;
            List<string> directories = new List<string>();
            string updates = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MixLab Cutter", "updates");
            if (Directory.Exists(updates)) directories.Add(updates);
            string root = @"\\192.168.1.27\MixLab\安装包\MixLab Cutter";
            if (Directory.Exists(root))
            {
                directories.Add(root);
                foreach (string child in Directory.GetDirectories(root)) directories.Add(child);
            }
            List<KeyValuePair<Version, string>> candidates = new List<KeyValuePair<Version, string>>();
            foreach (string directory in directories.Distinct())
            {
                try
                {
                    foreach (string file in Directory.GetFiles(directory, "MixLab Cutter_*_x64-setup.exe"))
                    {
                        Match match = Regex.Match(Path.GetFileName(file), "^MixLab Cutter_([0-9]+\\.[0-9]+\\.[0-9]+)_x64-setup\\.exe$");
                        Version parsed;
                        if (!match.Success || !Version.TryParse(match.Groups[1].Value, out parsed)) continue;
                        if (parsed >= current) continue;
                        candidates.Add(new KeyValuePair<Version, string>(parsed, file));
                    }
                }
                catch { }
            }
            foreach (KeyValuePair<Version, string> candidate in candidates.OrderByDescending(item => item.Key))
            {
                if (!InstallerChecksumMatches(candidate.Value)) continue;
                previousVersion = candidate.Key.ToString(3);
                return candidate.Value;
            }
            return null;
        }

        private static bool InstallerChecksumMatches(string installer)
        {
            try
            {
                string directory = Path.GetDirectoryName(installer);
                string fileName = Path.GetFileName(installer);
                string expected = "";
                string sums = Path.Combine(directory, "SHA256SUMS.txt");
                if (File.Exists(sums))
                {
                    foreach (string line in File.ReadAllLines(sums))
                    {
                        string[] parts = line.Trim().Split(new char[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
                        if (parts.Length >= 2 && parts[1] == fileName) { expected = parts[0]; break; }
                    }
                }
                if (string.IsNullOrEmpty(expected))
                {
                    string manifest = Path.Combine(directory, "update.json");
                    if (File.Exists(manifest))
                    {
                        string json = File.ReadAllText(manifest);
                        if (ExtractJsonString(json, "installer") == fileName) expected = ExtractJsonString(json, "sha256");
                    }
                }
                if (string.IsNullOrEmpty(expected)) return false;
                string actual;
                using (FileStream stream = File.OpenRead(installer))
                using (System.Security.Cryptography.SHA256 sha = System.Security.Cryptography.SHA256.Create())
                {
                    byte[] digest = sha.ComputeHash(stream);
                    StringBuilder builder = new StringBuilder();
                    foreach (byte value in digest) builder.Append(value.ToString("x2"));
                    actual = builder.ToString();
                }
                return string.Equals(expected.Trim(), actual, StringComparison.OrdinalIgnoreCase);
            }
            catch { return false; }
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


        private void RecordAction(string action, bool ok, string error)
        {
            repairActions.Add(new RepairAction { action = action, ok = ok, error = error ?? "" });
            Log((ok ? "已执行：" : "未执行：") + action + (string.IsNullOrEmpty(error) ? "" : "；" + error));
        }

        private static string ConfigPath()
        {
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "com.mixlab.cutter", "cutter-desktop-config.json");
        }

        private static string ExtractJsonString(string json, string key)
        {
            Match match = Regex.Match(json, "\"" + Regex.Escape(key) + "\"\\s*:\\s*\"((?:\\\\.|[^\"])*)\"");
            return match.Success ? Regex.Unescape(match.Groups[1].Value) : "";
        }

        private static long ExtractJsonLong(string json, string key)
        {
            Match match = Regex.Match(json, "\"" + Regex.Escape(key) + "\"\\s*:\\s*(-?[0-9]+)");
            long value;
            return match.Success && long.TryParse(match.Groups[1].Value, out value) ? value : -1;
        }

        private static string WorkspaceLeaseFallbackPath(string workspaceRoot)
        {
            byte[] bytes = Encoding.UTF8.GetBytes(workspaceRoot.Trim().ToLowerInvariant());
            string hash;
            using (System.Security.Cryptography.SHA256 sha = System.Security.Cryptography.SHA256.Create())
            {
                byte[] digest = sha.ComputeHash(bytes);
                StringBuilder builder = new StringBuilder();
                foreach (byte value in digest) builder.Append(value.ToString("x2"));
                hash = builder.ToString();
            }
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MixLab Cutter", "workspace-leases", hash + ".json");
        }

        private static bool ProcessNameIsMixLab(int pid)
        {
            try
            {
                Process process = Process.GetProcessById(pid);
                string name = process.ProcessName.ToLowerInvariant();
                return name.Contains("mixlab") || name.Contains("cutter") || name.Contains("searchd");
            }
            catch { return false; }
        }

        private static bool PidAlive(long pid)
        {
            if (pid <= 0) return false;
            try { Process.GetProcessById((int)pid); return true; } catch { return false; }
        }

        private static bool LeaseIsStale(string path, out string detail)
        {
            detail = "";
            try
            {
                string json = File.ReadAllText(path);
                long pid = ExtractJsonLong(json, "pid");
                string heartbeat = ExtractJsonString(json, "heartbeat_at");
                DateTime parsed;
                bool heartbeatOld = !DateTime.TryParse(heartbeat, out parsed) || (DateTime.UtcNow - parsed.ToUniversalTime()).TotalSeconds > 90;
                if (pid > 0 && PidAlive(pid) && !heartbeatOld)
                {
                    detail = "active pid=" + pid;
                    return false;
                }
                detail = "pid=" + pid + " heartbeat=" + heartbeat;
                return true;
            }
            catch { detail = "unreadable"; return true; }
        }

        private void CleanupStaleLeaseIfSafe(string path)
        {
            if (!File.Exists(path)) return;
            string detail;
            if (!LeaseIsStale(path, out detail))
            {
                RecordAction("workspace_lease_active", false, detail);
                return;
            }
            try
            {
                string backup = path + ".stale-backup-" + DateTime.Now.ToString("yyyyMMddHHmmss");
                File.Move(path, backup);
                RecordAction("cleanup_stale_workspace_lease", true, detail);
            }
            catch (Exception error)
            {
                RecordAction("cleanup_stale_workspace_lease", false, error.Message);
            }
        }

        private RepairDiagnosis DiagnoseBeforeRepair(string cutter)
        {
            if (string.IsNullOrEmpty(cutter)) return new RepairDiagnosis { Code = "app_missing", NeedsAdmin = true, Detail = "未找到 MixLab Cutter" };
            string configPath = ConfigPath();
            if (!File.Exists(configPath)) return new RepairDiagnosis { Code = "config_invalid", NeedsAdmin = true, Detail = "桌面配置不存在" };
            string config;
            try { config = File.ReadAllText(configPath); }
            catch (Exception error) { return new RepairDiagnosis { Code = "config_invalid", NeedsAdmin = true, Detail = error.Message }; }
            if (!config.TrimStart().StartsWith("{"))
            {
                return new RepairDiagnosis { Code = "config_invalid", NeedsAdmin = true, Detail = "桌面配置不是 JSON 对象" };
            }
            string workspaceRoot = ExtractJsonString(config, "local_workspace_root");
            if (string.IsNullOrEmpty(workspaceRoot)) return new RepairDiagnosis { Code = "config_invalid", NeedsAdmin = true, Detail = "本地素材库地址为空" };
            if (!Directory.Exists(workspaceRoot)) return new RepairDiagnosis { Code = "workspace_root_invalid", NeedsAdmin = true, Detail = workspaceRoot + " 不存在" };

            CleanupStaleLeaseIfSafe(Path.Combine(workspaceRoot, ".mixlab-workspace-lock.json"));
            CleanupStaleLeaseIfSafe(WorkspaceLeaseFallbackPath(workspaceRoot));
            if (repairActions.Any(action => action.action == "workspace_lease_active"))
            {
                return new RepairDiagnosis { Code = "workspace_lease_unavailable", NeedsAdmin = true, Detail = "存在活跃 workspace 租约" };
            }

            string binaries = Path.Combine(Path.GetDirectoryName(cutter), "binaries");
            if (!File.Exists(Path.Combine(binaries, "cutter-api-sidecar-x86_64-pc-windows-msvc.exe"))) return new RepairDiagnosis { Code = "sidecar_missing", NeedsAdmin = true, Detail = "缺少 cutter-api-sidecar" };
            if (!File.Exists(Path.Combine(binaries, "mixlab-searchd-x86_64-pc-windows-msvc.exe"))) return new RepairDiagnosis { Code = "sidecar_missing", NeedsAdmin = true, Detail = "缺少 mixlab-searchd" };

            List<int> owners = FindPortListeners(3789).Concat(FindPortListeners(3790)).Distinct().ToList();
            foreach (int pid in owners)
            {
                if (!ProcessNameIsMixLab(pid)) return new RepairDiagnosis { Code = "port_occupied", NeedsAdmin = true, Detail = "未知进程占用端口：" + DescribePortOwners(new List<int> { pid }) };
            }
            if (!HealthOk(3789)) return new RepairDiagnosis { Code = "engine_unreachable", NeedsAdmin = false, Detail = "3789 health 不通" };
            if (!HealthOk(3790)) return new RepairDiagnosis { Code = "searchd_unhealthy", NeedsAdmin = false, Detail = "3790 health 不通" };
            return new RepairDiagnosis { Code = "unknown", NeedsAdmin = false, Detail = "" };
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

        private static string LocalRepairRoot
        {
            get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MixLab Cutter", "repair"); }
        }

        private static string PendingDirectory
        {
            get { return Path.Combine(LocalRepairRoot, "pending"); }
        }

        private static string SentDirectory
        {
            get { return Path.Combine(LocalRepairRoot, "sent"); }
        }

        private static void EnsureQueueDirectories()
        {
            Directory.CreateDirectory(PendingDirectory);
            Directory.CreateDirectory(SentDirectory);
        }

        private static string NewFeedbackId()
        {
            for (int attempt = 0; attempt < 100; attempt++)
            {
                byte[] bytes = new byte[4];
                using (RandomNumberGenerator rng = RandomNumberGenerator.Create())
                {
                    rng.GetBytes(bytes);
                }
                uint number = BitConverter.ToUInt32(bytes, 0) % 100000000u;
                string id = "FB-" + DateTime.Now.ToString("yyyyMMdd") + "-" + number.ToString("D8");
                if (!Directory.Exists(Path.Combine(PendingDirectory, id)) && !Directory.Exists(Path.Combine(SentDirectory, id)))
                {
                    return id;
                }
            }
            throw new InvalidOperationException("无法生成唯一反馈编号");
        }

        private DiagnosticsSubmission CreateAndSubmitDiagnostics(string reason, string staging, bool submit, string diagnosis, List<RepairAction> actions, bool needsAdmin)
        {
            string id = NewFeedbackId();
            string packageTemp = Path.Combine(Path.GetTempPath(), "MixLab-Cutter-Package-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(packageTemp);
            string zipPath = "";
            bool queued = false;
            bool submitted = false;
            string pendingPath = "";
            try
            {
                BuildFeedbackPackage(packageTemp, id, reason, staging, diagnosis, actions, needsAdmin);
                string stamp = DateTime.Now.ToString("yyyyMMdd-HHmmss");
                string zipName = "MixLab-Cutter-Diagnostics-" + Environment.MachineName + "-" + stamp + ".zip";
                zipPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), zipName);
                if (File.Exists(zipPath)) File.Delete(zipPath);
                ZipFile.CreateFromDirectory(packageTemp, zipPath, CompressionLevel.Optimal, false);
                if (submit)
                {
                    EnsureQueueDirectories();
                    pendingPath = Path.Combine(PendingDirectory, id);
                    if (Directory.Exists(pendingPath)) throw new InvalidOperationException("反馈编号冲突");
                    Directory.Move(packageTemp, pendingPath);
                    queued = true;
                    submitted = TryUploadFeedback(id);
                }
                else
                {
                    Directory.Delete(packageTemp, true);
                }
                return new DiagnosticsSubmission
                {
                    Id = id,
                    ZipPath = zipPath,
                    PendingPath = submitted ? Path.Combine(SentDirectory, id) : pendingPath,
                    Queued = queued,
                    Submitted = submitted
                };
            }
            finally
            {
                try { if (Directory.Exists(packageTemp)) Directory.Delete(packageTemp, true); } catch { }
            }
        }

        private void StartQueueFlush()
        {
            Thread worker = new Thread(delegate() { FlushQueue(); });
            worker.IsBackground = true;
            worker.Start();
        }

        private void FlushQueue()
        {
            lock (QueueLock)
            {
                if (queueRunning) return;
                queueRunning = true;
            }
            try
            {
                EnsureQueueDirectories();
                int delivered = 0;
                int failed = 0;
                foreach (string directory in Directory.GetDirectories(PendingDirectory))
                {
                    string name = Path.GetFileName(directory);
                    if (name.StartsWith(".")) continue;
                    if (TryUploadFeedback(name)) delivered++;
                    else failed++;
                }
                if (delivered > 0) Log("已自动补交 " + delivered + " 条诊断反馈。");
                if (failed > 0) Log("有 " + failed + " 条诊断反馈等待共享恢复后重试。");
            }
            catch (Exception ex)
            {
                Log("自动补交检查失败：" + ex.Message);
            }
            finally
            {
                lock (QueueLock) { queueRunning = false; }
            }
        }

        private static bool TryUploadFeedback(string id)
        {
            string pending = Path.Combine(PendingDirectory, id);
            string sent = Path.Combine(SentDirectory, id);
            string target = Path.Combine(FeedbackInbox, id);
            if (!Directory.Exists(pending)) return Directory.Exists(sent) || Directory.Exists(target);
            if (Directory.Exists(sent))
            {
                try { Directory.Delete(pending, true); } catch { }
                return true;
            }
            if (Directory.Exists(target))
            {
                MoveToSent(id);
                return true;
            }
            string partial = Path.Combine(FeedbackInbox, id + ".partial");
            try
            {
                Directory.CreateDirectory(FeedbackInbox);
                if (Directory.Exists(partial)) Directory.Delete(partial, true);
                CopyDirectoryRaw(pending, partial);
                if (Directory.Exists(target))
                {
                    try { Directory.Delete(partial, true); } catch { }
                    MoveToSent(id);
                    return true;
                }
                Directory.Move(partial, target);
                MoveToSent(id);
                return true;
            }
            catch
            {
                try { if (Directory.Exists(partial)) Directory.Delete(partial, true); } catch { }
                return false;
            }
        }

        private static void MoveToSent(string id)
        {
            string pending = Path.Combine(PendingDirectory, id);
            string sent = Path.Combine(SentDirectory, id);
            if (Directory.Exists(sent))
            {
                try { if (Directory.Exists(pending)) Directory.Delete(pending, true); } catch { }
                return;
            }
            try
            {
                if (Directory.Exists(pending)) Directory.Move(pending, sent);
            }
            catch
            {
                try
                {
                    if (Directory.Exists(pending))
                    {
                        CopyDirectoryRaw(pending, sent);
                        Directory.Delete(pending, true);
                    }
                }
                catch { }
            }
        }

        private void BuildFeedbackPackage(string packageDirectory, string id, string reason, string staging, string diagnosis, List<RepairAction> actions, bool needsAdmin)
        {
            string logsDirectory = Path.Combine(packageDirectory, "logs");
            Directory.CreateDirectory(logsDirectory);
            string sourceLogs = "";
            if (!string.IsNullOrEmpty(staging) && Directory.Exists(Path.Combine(staging, "logs"))) sourceLogs = Path.Combine(staging, "logs");
            else sourceLogs = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "MixLab Cutter", "logs");
            if (Directory.Exists(sourceLogs)) CopyLogTails(sourceLogs, logsDirectory);

            string configPath = "";
            string stagedConfig = string.IsNullOrEmpty(staging) ? "" : Path.Combine(staging, "cutter-desktop-config.json");
            if (!string.IsNullOrEmpty(stagedConfig) && File.Exists(stagedConfig)) configPath = stagedConfig;
            else
            {
                string config1 = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "MixLab Cutter", "cutter-desktop-config.json");
                string config2 = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "com.mixlab.cutter", "cutter-desktop-config.json");
                if (File.Exists(config1)) configPath = config1;
                else if (File.Exists(config2)) configPath = config2;
            }
            if (!string.IsNullOrEmpty(configPath)) CopySanitizedFile(configPath, Path.Combine(packageDirectory, "cutter-desktop-config.json"));

            string cutter = FindCutterExecutable();
            string appVersion = "unknown";
            if (!string.IsNullOrEmpty(cutter) && File.Exists(cutter))
            {
                try { appVersion = FileVersionInfo.GetVersionInfo(cutter).FileVersion; } catch { }
            }
            string os = Environment.OSVersion.VersionString;
            string username = Environment.MachineName + "\\" + Environment.UserName;
            string health3789 = HealthOk(3789) ? "200" : "失败";
            string health3790 = HealthOk(3790) ? "200" : "失败";
            string diagnostics = BuildDiagnosticsText(reason, cutter, appVersion, health3789, health3790);
            File.WriteAllText(Path.Combine(packageDirectory, "diagnostics.txt"), "\uFEFF" + diagnostics, Encoding.UTF8);

            StringBuilder context = new StringBuilder();
            context.Append("{\n");
            AppendJsonPair(context, "repair_reason", reason, true);
            AppendJsonPair(context, "cutter_path", cutter, true);
            AppendJsonPair(context, "health_3789", health3789, true);
            AppendJsonPair(context, "health_3790", health3790, true);
            AppendJsonPair(context, "os", os, true);
            AppendJsonPair(context, "nas", Directory.Exists(FeedbackInbox) ? "可写" : "不可写", true);
            context.Append("  \"disk\": \"").Append(JsonEscape(string.Join(", ", DriveInfo.GetDrives().Select(delegate(DriveInfo drive) { return drive.Name + " " + drive.DriveType; }).ToArray()))).Append("\"\n");
            context.Append("}");
            File.WriteAllText(Path.Combine(packageDirectory, "context.json"), context.ToString(), new UTF8Encoding(false));

            StringBuilder feedback = new StringBuilder();
            feedback.Append("{\n");
            AppendJsonPair(feedback, "schema_version", "1.0", true);
            AppendJsonPair(feedback, "feedback_id", id, true);
            AppendJsonPair(feedback, "created_at", DateTime.UtcNow.ToString("o"), true);
            AppendJsonPair(feedback, "category", "卡住/报错", true);
            AppendJsonPair(feedback, "expected", "恢复剪辑师工作台", true);
            AppendJsonPair(feedback, "app_version", appVersion, true);
            AppendJsonPair(feedback, "username", username, true);
            AppendJsonPair(feedback, "build_commit", "unknown", true);
            AppendJsonPair(feedback, "release_version", "unknown", true);
            AppendJsonPair(feedback, "page", "startup/loading", true);
            AppendJsonPair(feedback, "source", "repair-tool", true);
            AppendJsonPair(feedback, "tool_version", ToolVersion, true);
            AppendJsonPair(feedback, "diagnosis", string.IsNullOrEmpty(diagnosis) ? "unknown" : diagnosis, true);
            AppendJsonPair(feedback, "case_id", id, true);
            feedback.Append("  \"needs_admin\": ").Append(needsAdmin ? "true" : "false").Append(",\n");
            feedback.Append("  \"message\": \"").Append(JsonEscape(needsAdmin ? "自动修复失败，需要管理员介入" : reason)).Append("\",\n");
            feedback.Append("  \"repair_attempts\": [");
            if (actions != null && actions.Count > 0)
            {
                for (int index = 0; index < actions.Count; index++)
                {
                    if (index > 0) feedback.Append(",");
                    feedback.Append("{\"action\":\"").Append(JsonEscape(actions[index].action)).Append("\",\"ok\":").Append(actions[index].ok ? "true" : "false").Append(",\"error\":\"").Append(JsonEscape(actions[index].error)).Append("\"}");
                }
            }
            feedback.Append("],\n");
            feedback.Append("  \"context\": ").Append(context.ToString()).Append(",\n");
            feedback.Append("  \"timings\": {},\n");
            feedback.Append("  \"errors\": [\"").Append(JsonEscape(reason)).Append("\"],\n");
            feedback.Append("  \"attachments\": [\"diagnostics.txt\", \"logs/\", \"cutter-desktop-config.json\"]\n");
            feedback.Append("}");
            File.WriteAllText(Path.Combine(packageDirectory, "feedback.json"), feedback.ToString(), new UTF8Encoding(false));

            StringBuilder events = new StringBuilder();
            lock (operationLogLock)
            {
                foreach (string line in operationLog)
                {
                    events.Append("{\"event\": \"").Append(JsonEscape(line)).Append("\"}\n");
                }
            }
            File.WriteAllText(Path.Combine(packageDirectory, "events.jsonl"), events.ToString(), new UTF8Encoding(false));
        }

        private static void AppendJsonPair(StringBuilder builder, string name, string value, bool comma)
        {
            builder.Append("  \"").Append(JsonEscape(name)).Append("\": \"").Append(JsonEscape(value)).Append("\"");
            if (comma) builder.Append(",");
            builder.Append("\n");
        }

        private static string JsonEscape(string value)
        {
            if (value == null) return "";
            return value.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "\\r").Replace("\n", "\\n").Replace("\t", "\\t");
        }

        private static void CopyLogTails(string source, string destination)
        {
            Directory.CreateDirectory(destination);
            foreach (string file in Directory.GetFiles(source))
            {
                try
                {
                    byte[] data = File.ReadAllBytes(file);
                    int start = data.Length > 32768 ? data.Length - 32768 : 0;
                    string text = Encoding.UTF8.GetString(data, start, data.Length - start);
                    text = Sanitize(text);
                    File.WriteAllText(Path.Combine(destination, Path.GetFileName(file)), text, Encoding.UTF8);
                }
                catch { }
            }
            foreach (string folder in Directory.GetDirectories(source))
            {
                CopyLogTails(folder, Path.Combine(destination, Path.GetFileName(folder)));
            }
        }

        private static void CopyDirectoryRaw(string source, string destination)
        {
            Directory.CreateDirectory(destination);
            foreach (string file in Directory.GetFiles(source))
            {
                File.Copy(file, Path.Combine(destination, Path.GetFileName(file)), true);
            }
            foreach (string folder in Directory.GetDirectories(source))
            {
                CopyDirectoryRaw(folder, Path.Combine(destination, Path.GetFileName(folder)));
            }
        }

        private string BuildDiagnosticsText(string reason, string cutter, string appVersion, string health3789, string health3790)
        {
            StringBuilder text = new StringBuilder();
            text.AppendLine("MixLab Cutter 诊断包");
            text.AppendLine("生成时间：" + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));
            text.AppendLine("工具版本：" + ToolVersion);
            text.AppendLine("电脑名：" + Environment.MachineName);
            text.AppendLine("用户：" + Environment.UserName);
            text.AppendLine("系统：" + Environment.OSVersion.VersionString);
            text.AppendLine("原因：" + reason);
            text.AppendLine("诊断分类：" + (string.IsNullOrEmpty(currentDiagnosis) ? "unknown" : currentDiagnosis));
            text.AppendLine("需要管理员介入：" + (currentNeedsAdmin ? "是" : "否"));
            foreach (RepairAction action in repairActions) text.AppendLine("修复动作：" + action.action + " ok=" + action.ok + (string.IsNullOrEmpty(action.error) ? "" : "；" + action.error));
            text.AppendLine("Cutter 路径：" + (string.IsNullOrEmpty(cutter) ? "未找到" : cutter));
            text.AppendLine("Cutter 版本：" + appVersion);
            text.AppendLine("3789 health：" + health3789);
            text.AppendLine("3790 health：" + health3790);
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
            lock (operationLogLock)
            {
                foreach (string line in operationLog) text.AppendLine(line);
            }
            return text.ToString();
        }

        private void SetBusy(bool value)
        {
            SafeUi(delegate()
            {
                busy = value;
                repairButton.Enabled = !value;
                diagnosticsButton.Enabled = !value;
                rollbackButton.Enabled = !value;
                moreLink.Enabled = !value;
                UseWaitCursor = value;
            });
        }

        private void SetStatus(string value)
        {
            SafeUi(delegate() { ApplyStatusCard(value); });
            AddLog(value);
        }

        private void ApplyStatusCard(string value)
        {
            if (stateTitleLabel == null || stateIconLabel == null || stateDetailLabel == null) return;
            string text = value ?? "";
            bool failed = text.Contains("未完成") || text.Contains("失败") || text.Contains("已提交") || text.Contains("已保存") || text.Contains("无法") || text.Contains("需要管理员");
            bool success = !failed && (text.Contains("修复完成") || text.Contains("健康"));
            bool running = !failed && !success && (text.StartsWith("正在") || text.Contains("等待") || text.Contains("诊断"));
            stateDetailLabel.Text = text;
            if (failed)
            {
                stateTitleLabel.Text = "需要管理员";
                stateIconLabel.Text = "!";
                stateIconLabel.ForeColor = Color.FromArgb(198, 117, 37);
                stateIconLabel.BackColor = Color.FromArgb(255, 244, 228);
            }
            else if (success)
            {
                stateTitleLabel.Text = "修复完成";
                stateIconLabel.Text = "✓";
                stateIconLabel.ForeColor = Color.FromArgb(31, 148, 92);
                stateIconLabel.BackColor = Color.FromArgb(232, 246, 238);
            }
            else if (running)
            {
                stateTitleLabel.Text = "正在修复";
                stateIconLabel.Text = "●";
                stateIconLabel.ForeColor = Color.FromArgb(42, 106, 224);
                stateIconLabel.BackColor = Color.FromArgb(232, 240, 255);
            }
            else
            {
                stateTitleLabel.Text = "准备就绪";
                stateIconLabel.Text = "✓";
                stateIconLabel.ForeColor = Color.FromArgb(31, 148, 92);
                stateIconLabel.BackColor = Color.FromArgb(232, 246, 238);
            }
            if (stepLabels == null) return;
            for (int index = 0; index < stepLabels.Length; index++)
            {
                bool active = running && index == 1;
                bool done = success;
                bool attention = failed && index == 2;
                stepLabels[index].BackColor = attention ? Color.FromArgb(255, 244, 228) : done ? Color.FromArgb(232, 246, 238) : active ? Color.FromArgb(232, 240, 255) : Color.FromArgb(243, 246, 251);
                stepLabels[index].ForeColor = attention ? Color.FromArgb(198, 117, 37) : done ? Color.FromArgb(31, 148, 92) : active ? Color.FromArgb(42, 106, 224) : Color.FromArgb(117, 132, 153);
            }
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
            lock (operationLogLock)
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
