// ARPRO OCR Observer — (c) 2026 CV. Arindra Production & ARPRO Esport · MIT License
// Aplikasi kecil untuk PC observer: membuka OCR Control milik server ARPRO ESPORT TOOLS di Microsoft Edge / Google Chrome
// (mode aplikasi) dengan izin capture layar / HDMI untuk alamat server, lalu data OCR terkirim langsung ke tool.
// Browser biasa memblokir capture di alamat http://IP (bukan localhost); aplikasi ini memberi izin khusus untuk alamat server saja,
// memakai profil browser terpisah (tidak mengganggu browser yang biasa dipakai).
// Build: observer\build.cmd (memakai C# compiler bawaan Windows / .NET Framework 4).
// Opsi baris perintah (mis. untuk shortcut desktop yang langsung tersambung):
//   ARPRO-OCR-Observer.exe --ip=192.168.1.10 --port=3000 --key=123456 --name=OBS1 --connect
//   --connect tanpa --ip / --key memakai pengaturan terakhir · --status-file=path menulis pesan status (untuk uji)
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;

[assembly: System.Reflection.AssemblyTitle("ARPRO OCR Observer")]
[assembly: System.Reflection.AssemblyProduct("ARPRO ESPORT TOOLS")]
[assembly: System.Reflection.AssemblyCompany("CV. Arindra Production & ARPRO Esport")]
[assembly: System.Reflection.AssemblyCopyright("(c) 2026 CV. Arindra Production & ARPRO Esport")]
[assembly: System.Reflection.AssemblyVersion("1.0.0.0")]

namespace ArproOcrObserver
{
    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm(args));
        }
    }

    class MainForm : Form
    {
        static readonly Color Purple = ColorTranslator.FromHtml("#6A2FD6");
        static readonly Color Ink = ColorTranslator.FromHtml("#170B36");
        static readonly Color Yellow = ColorTranslator.FromHtml("#FFE01C");
        static readonly Color Pink = ColorTranslator.FromHtml("#FF2B8A");
        static readonly Color Muted = ColorTranslator.FromHtml("#5B5084");
        static readonly Color Bg = ColorTranslator.FromHtml("#F4EFFF");
        static readonly string[] Stripe = { "#FFE01C", "#FF2B8A", "#FF2D2D", "#1BA0FF", "#7ED957" };

        readonly string dataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ARPRO OCR Observer");
        readonly TextBox txtIp = new TextBox(), txtPort = new TextBox(), txtKey = new TextBox(), txtName = new TextBox();
        readonly Button btnGo = new Button();
        readonly Label lblStatus = new Label();
        string statusFile;

        public MainForm(string[] args)
        {
            Text = "ARPRO OCR Observer";
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(520, 470);
            BackColor = Bg;
            Font = new Font("Segoe UI", 10f);
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

            var head = new Panel { Dock = DockStyle.Top, Height = 86, BackColor = Purple };
            head.Controls.Add(new Label { Text = "ARPRO OCR OBSERVER", ForeColor = Yellow, Font = new Font("Segoe UI Black", 20f, FontStyle.Bold), AutoSize = true, Location = new Point(22, 12), BackColor = Color.Transparent });
            head.Controls.Add(new Label { Text = "Kirim data OCR dari PC observer ke ARPRO ESPORT TOOLS", ForeColor = Color.White, AutoSize = true, Location = new Point(25, 54), BackColor = Color.Transparent });
            var stripe = new Panel { Dock = DockStyle.Top, Height = 6 };
            stripe.Paint += (s, e) =>
            {
                int w = stripe.Width / Stripe.Length + 1;
                for (int i = 0; i < Stripe.Length; i++)
                    using (var b = new SolidBrush(ColorTranslator.FromHtml(Stripe[i]))) e.Graphics.FillRectangle(b, i * w, 0, w, stripe.Height);
            };
            Controls.Add(stripe);
            Controls.Add(head);

            int y = 112;
            AddField("IP server tool (lihat OCR Control di PC server)", txtIp, ref y, 300);
            var lblPort = new Label { Text = "Port", AutoSize = true, ForeColor = Ink, Font = new Font("Segoe UI Semibold", 9.5f), Location = new Point(352, 112) };
            Controls.Add(lblPort);
            txtPort.Location = new Point(355, 134); txtPort.Width = 140; txtPort.Font = new Font("Segoe UI", 12f);
            Controls.Add(txtPort);
            AddField("Kode pasangan 6 digit (tampil di OCR Control PC server)", txtKey, ref y, 300);
            txtKey.MaxLength = 6;
            AddField("Nama observer (tampil di tool sebagai sumber OCR)", txtName, ref y, 470);

            btnGo.Text = "SAMBUNGKAN && BUKA OCR";
            btnGo.Font = new Font("Segoe UI Black", 11.5f, FontStyle.Bold);
            btnGo.BackColor = Yellow; btnGo.ForeColor = Ink;
            btnGo.FlatStyle = FlatStyle.Flat; btnGo.FlatAppearance.BorderColor = Ink; btnGo.FlatAppearance.BorderSize = 2;
            btnGo.Size = new Size(470, 50); btnGo.Location = new Point(25, y + 4);
            btnGo.Cursor = Cursors.Hand;
            btnGo.Click += (s, e) => Connect();
            Controls.Add(btnGo);
            AcceptButton = btnGo;

            lblStatus.Location = new Point(25, y + 64); lblStatus.Size = new Size(470, 70);
            lblStatus.ForeColor = Muted;
            lblStatus.UseMnemonic = false; // tanda "&" tampil apa adanya
            lblStatus.Text = "Isi IP server & kode pasangan, lalu klik SAMBUNGKAN. OCR Control terbuka di jendela terpisah; pilih sumber gambar (layar / HDMI capture) lalu START OCR.";
            Controls.Add(lblStatus);

            LoadConfig();

            bool auto = false;
            foreach (var a in args ?? new string[0])
            {
                int eq = a.IndexOf('=');
                string k = (eq > 0 ? a.Substring(0, eq) : a).ToLowerInvariant(), v = eq > 0 ? a.Substring(eq + 1) : "";
                if (k == "--ip") txtIp.Text = v;
                else if (k == "--port") txtPort.Text = v;
                else if (k == "--key") txtKey.Text = v;
                else if (k == "--name") txtName.Text = v;
                else if (k == "--connect") auto = true;
                else if (k == "--status-file") statusFile = v;
            }
            if (auto) Shown += (s, e) => Connect();
        }

        void AddField(string label, TextBox box, ref int y, int width)
        {
            Controls.Add(new Label { Text = label, AutoSize = true, ForeColor = Ink, Font = new Font("Segoe UI Semibold", 9.5f), Location = new Point(22, y) });
            box.Location = new Point(25, y + 22); box.Width = width; box.Font = new Font("Segoe UI", 12f);
            Controls.Add(box);
            y += 66;
        }

        string ConfigPath { get { return Path.Combine(dataDir, "observer.ini"); } }

        void LoadConfig()
        {
            txtPort.Text = "3000";
            txtName.Text = Environment.MachineName;
            try
            {
                if (!File.Exists(ConfigPath)) return;
                foreach (var line in File.ReadAllLines(ConfigPath))
                {
                    int i = line.IndexOf('=');
                    if (i < 1) continue;
                    string k = line.Substring(0, i).Trim(), v = line.Substring(i + 1).Trim();
                    if (k == "ip") txtIp.Text = v;
                    else if (k == "port") txtPort.Text = v;
                    else if (k == "key") txtKey.Text = v;
                    else if (k == "name") txtName.Text = v;
                }
            }
            catch { }
        }

        void SaveConfig(string ip, string port, string key, string name)
        {
            try
            {
                Directory.CreateDirectory(dataDir);
                File.WriteAllText(ConfigPath, "ip=" + ip + "\r\nport=" + port + "\r\nkey=" + key + "\r\nname=" + name + "\r\n", Encoding.UTF8);
            }
            catch { }
        }

        void Status(string text, bool error)
        {
            lblStatus.ForeColor = error ? ColorTranslator.FromHtml("#AD1212") : ColorTranslator.FromHtml("#1D6B28");
            lblStatus.Text = text;
            Application.DoEvents();
            if (!string.IsNullOrEmpty(statusFile))
            {
                try { File.AppendAllText(statusFile, (error ? "ERROR " : "OK ") + text + "\r\n", Encoding.UTF8); } catch { }
            }
        }

        void Connect()
        {
            string ip = txtIp.Text.Trim().Replace("http://", "").Replace("https://", "").TrimEnd('/');
            int colon = ip.IndexOf(':');
            if (colon > 0) { txtPort.Text = ip.Substring(colon + 1); ip = ip.Substring(0, colon); txtIp.Text = ip; }
            string port = txtPort.Text.Trim(), key = txtKey.Text.Trim(), name = Regex.Replace(txtName.Text.Trim(), @"[^\w .\-]", "");
            if (!Regex.IsMatch(ip, @"^[A-Za-z0-9.\-]+$")) { Status("IP server belum benar. Contoh: 192.168.1.10", true); return; }
            int p;
            if (!int.TryParse(port, out p) || p < 1 || p > 65535) { Status("Port belum benar (bawaan 3000).", true); return; }
            if (!Regex.IsMatch(key, @"^\d{6}$")) { Status("Kode pasangan harus 6 angka.", true); return; }

            string origin = "http://" + ip + ":" + p;
            btnGo.Enabled = false;
            Status("Menghubungi " + origin + " …", false);
            try
            {
                using (var wc = new TimeoutClient())
                {
                    wc.Encoding = Encoding.UTF8;
                    string body = wc.DownloadString(origin + "/api/ocr/observer/check?key=" + Uri.EscapeDataString(key));
                    if (!body.Contains("\"ok\":true")) throw new Exception("Jawaban server tidak dikenal. Pastikan IP mengarah ke ARPRO ESPORT TOOLS.");
                }
            }
            catch (WebException ex)
            {
                btnGo.Enabled = true;
                string msg = "Tidak bisa terhubung ke " + origin + ". Pastikan server tool menyala, PC ini satu jaringan (Wi-Fi / LAN) dengan server, dan IP benar.";
                var resp = ex.Response as HttpWebResponse;
                if (resp != null)
                {
                    try
                    {
                        using (var r = new StreamReader(resp.GetResponseStream()))
                        {
                            var m = Regex.Match(r.ReadToEnd(), "\"message\":\"([^\"]+)\"");
                            msg = m.Success ? Regex.Unescape(m.Groups[1].Value) : "Server menolak (HTTP " + (int)resp.StatusCode + ").";
                        }
                    }
                    catch { }
                }
                Status(msg, true);
                return;
            }
            catch (Exception ex)
            {
                btnGo.Enabled = true;
                Status(ex.Message, true);
                return;
            }

            SaveConfig(ip, port, key, name);
            string browser = FindBrowser();
            if (browser == null)
            {
                btnGo.Enabled = true;
                Status("Microsoft Edge / Google Chrome tidak ditemukan di PC ini. Pasang salah satunya lalu coba lagi.", true);
                return;
            }
            string url = origin + "/ocrcontrol.html?observer=1&key=" + Uri.EscapeDataString(key) + "&name=" + Uri.EscapeDataString(name);
            string profile = Path.Combine(dataDir, "browser");
            string args = "--app=\"" + url + "\"" +
                " --user-data-dir=\"" + profile + "\"" +
                " --unsafely-treat-insecure-origin-as-secure=" + origin +
                // OCR tetap cepat walau jendela tertutup jendela lain / diperkecil
                " --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding" +
                " --no-first-run --no-default-browser-check --window-size=1600,900";
            try
            {
                Process.Start(new ProcessStartInfo(browser, args) { UseShellExecute = false });
                Status("Tersambung. OCR Control terbuka di jendela baru: pilih sumber gambar, HUBUNGKAN, lalu START OCR. Jendela ini boleh ditutup.", false);
            }
            catch (Exception ex)
            {
                Status("Gagal membuka browser: " + ex.Message, true);
            }
            btnGo.Enabled = true;
        }

        static string FindBrowser()
        {
            string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
            string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string[] list = {
                Path.Combine(pf86, @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(pf, @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(pf, @"Google\Chrome\Application\chrome.exe"),
                Path.Combine(pf86, @"Google\Chrome\Application\chrome.exe"),
                Path.Combine(local, @"Google\Chrome\Application\chrome.exe")
            };
            foreach (var f in list) if (File.Exists(f)) return f;
            return null;
        }
    }

    class TimeoutClient : WebClient
    {
        protected override WebRequest GetWebRequest(Uri address)
        {
            var r = base.GetWebRequest(address);
            r.Timeout = 5000;
            var h = r as HttpWebRequest;
            if (h != null) { h.ReadWriteTimeout = 5000; h.Proxy = null; }
            return r;
        }
    }
}
