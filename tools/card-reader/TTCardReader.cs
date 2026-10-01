// TransitTrack Card Reader - helper for the ACS ACR122U USB NFC reader.
//
// Browsers can't open smart-card readers (WebUSB blocks them and the ACR122U
// isn't a HID device), so this small program talks to the reader through
// Windows' smart-card service (winscard.dll) and passes each card's ID to the
// TransitTrack page over http://127.0.0.1:8765 (this computer only).
//
//   GET /events    Server-Sent Events: status, card, removed, log
//   GET /status    reader status as JSON
//   GET /feedback?kind=success|error|idle&beep=1&led=1   flash / beep the reader
//   GET /result?ok=1|0                                   same, for kiosk screens
//
// Written for the C# 5 compiler that ships with Windows PowerShell 5.1
// (no string interpolation, no ?. operator, no expression-bodied members).
// Build step: tools/card-reader/build.py embeds this file into
// public/tools/TransitTrack-Card-Reader.bat.
using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class TTCardReader
{
    const string Version = "1.0.0";

    const uint SCARD_SCOPE_USER = 0;
    const uint SCARD_SHARE_SHARED = 2;
    const uint SCARD_SHARE_DIRECT = 3;
    const uint SCARD_PROTOCOL_T0 = 1;
    const uint SCARD_PROTOCOL_T1 = 2;
    const uint SCARD_LEAVE_CARD = 0;
    const uint SCARD_STATE_UNAWARE = 0;
    const uint SCARD_STATE_CHANGED = 0x2;
    const uint SCARD_STATE_UNAVAILABLE = 0x8;
    const uint SCARD_STATE_PRESENT = 0x20;
    const uint SCARD_STATE_MUTE = 0x200;
    const int SCARD_E_TIMEOUT = unchecked((int)0x8010000A);
    const uint IOCTL_CCID_ESCAPE = 0x003136B0; // SCARD_CTL_CODE(3500)

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct SCARD_READERSTATE
    {
        public string szReader;
        public IntPtr pvUserData;
        public uint dwCurrentState;
        public uint dwEventState;
        public uint cbAtr;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 36)]
        public byte[] rgbAtr;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct SCARD_IO_REQUEST
    {
        public uint dwProtocol;
        public uint cbPciLength;
    }

    [DllImport("winscard.dll")]
    static extern int SCardEstablishContext(uint dwScope, IntPtr r1, IntPtr r2, out IntPtr phContext);
    [DllImport("winscard.dll")]
    static extern int SCardReleaseContext(IntPtr hContext);
    [DllImport("winscard.dll", EntryPoint = "SCardListReadersW")]
    static extern int SCardListReaders(IntPtr hContext, byte[] mszGroups, byte[] mszReaders, ref int pcchReaders);
    [DllImport("winscard.dll", EntryPoint = "SCardGetStatusChangeW", CharSet = CharSet.Unicode)]
    static extern int SCardGetStatusChange(IntPtr hContext, int dwTimeout, [In, Out] SCARD_READERSTATE[] rgReaderStates, int cReaders);
    [DllImport("winscard.dll", EntryPoint = "SCardConnectW", CharSet = CharSet.Unicode)]
    static extern int SCardConnect(IntPtr hContext, string szReader, uint dwShareMode, uint dwPreferredProtocols, out IntPtr phCard, out uint pdwActiveProtocol);
    [DllImport("winscard.dll")]
    static extern int SCardDisconnect(IntPtr hCard, uint dwDisposition);
    [DllImport("winscard.dll")]
    static extern int SCardTransmit(IntPtr hCard, ref SCARD_IO_REQUEST pioSendPci, byte[] pbSendBuffer, int cbSendLength, IntPtr pioRecvPci, byte[] pbRecvBuffer, ref int pcbRecvLength);
    [DllImport("winscard.dll")]
    static extern int SCardControl(IntPtr hCard, uint dwControlCode, byte[] lpInBuffer, int cbInBufferSize, byte[] lpOutBuffer, int cbOutBufferSize, out int lpBytesReturned);

    class Job
    {
        public byte[] Apdu;
        public bool Ok;
        public string Error;
        public ManualResetEvent Done = new ManualResetEvent(false);
    }

    static readonly object ClientsLock = new object();
    static readonly object JobsLock = new object();
    static readonly List<Stream> Clients = new List<Stream>();
    static readonly Queue<Job> Jobs = new Queue<Job>();
    static readonly List<string> AllowedOrigins = new List<string>();

    // PC/SC state: only ever touched by the reader thread.
    static IntPtr Ctx = IntPtr.Zero;
    static IntPtr CardHandle = IntPtr.Zero;
    static uint CardProto = 0;
    static bool BuzzerConfigured = false;

    static volatile string ReaderName = null;
    static long IdleAtTicks = 0;
    static bool Simulate = false;

    public static void Run(int port, string extraOrigins, bool simulate)
    {
        if (Start(port, extraOrigins, simulate)) Wait();
    }

    // Starts listening and watching the reader in the background, so the
    // page can connect straight away (even while the window still asks a
    // question). Returns false if another copy is already running.
    public static bool Start(int port, string extraOrigins, bool simulate)
    {
        Simulate = simulate;
        AllowedOrigins.Add("https://eager-transit-track-go.base44.app");
        if (!string.IsNullOrEmpty(extraOrigins))
        {
            foreach (string o in extraOrigins.Split(','))
            {
                string t = o.Trim().TrimEnd('/');
                if (t.Length > 0) AllowedOrigins.Add(t);
            }
        }

        TcpListener listener;
        try
        {
            listener = new TcpListener(IPAddress.Loopback, port);
            listener.Start();
        }
        catch (SocketException)
        {
            Console.WriteLine("  The card reader helper is already running (port " + port + " is in use).");
            Console.WriteLine("  Look for its other window, or restart the PC if you can't find it.");
            return false;
        }
        Log("ok", "Listening on http://127.0.0.1:" + port + " (this computer only)" + (Simulate ? " - SIMULATE MODE" : ""));

        Thread http = new Thread(delegate () { AcceptLoop(listener); });
        http.IsBackground = true;
        http.Start();
        Thread ping = new Thread(PingLoop);
        ping.IsBackground = true;
        ping.Start();
        Thread readerThread = new Thread(ReaderLoop);
        readerThread.IsBackground = true;
        readerThread.Start();
        return true;
    }

    public static void Wait()
    {
        while (true) Thread.Sleep(60000);
    }

    // ------------------------------------------------------------------ reader

    static void ReaderLoop()
    {
        bool warnedService = false;
        bool warnedNoReader = false;
        while (true)
        {
            try
            {
                if (Ctx == IntPtr.Zero)
                {
                    int rc = SCardEstablishContext(SCARD_SCOPE_USER, IntPtr.Zero, IntPtr.Zero, out Ctx);
                    if (rc != 0)
                    {
                        Ctx = IntPtr.Zero;
                        if (!warnedService)
                        {
                            // 0x8010001D SCARD_E_NO_SERVICE: the Smart Card service is stopped (it starts when a reader is plugged in).
                            Log("warn", rc == unchecked((int)0x8010001D)
                                ? "Waiting for the reader - plug in the ACR122U (Windows' Smart Card service isn't running yet)"
                                : "Waiting for the reader - plug in the ACR122U (" + Hex(rc) + ")");
                            warnedService = true;
                        }
                        SetReader(null);
                        IdleWait(2000);
                        continue;
                    }
                    warnedService = false;
                }
                string reader = FindReader();
                if (reader == null)
                {
                    SetReader(null);
                    if (!warnedNoReader) { Log("warn", "No NFC reader found - plug in the ACR122U"); warnedNoReader = true; }
                    ReleaseContext();
                    IdleWait(2000);
                    continue;
                }
                warnedNoReader = false;
                SetReader(reader);
                Log("ok", "Reader ready: " + reader);
                WatchReader(reader);
            }
            catch (DllNotFoundException)
            {
                if (Simulate) { SimulatedLoop(); return; }
                Log("error", "winscard.dll is missing - this helper needs Windows.");
                IdleWait(5000);
            }
            catch (EntryPointNotFoundException)
            {
                if (Simulate) { SimulatedLoop(); return; }
                Log("error", "This system's smart-card library isn't compatible.");
                IdleWait(5000);
            }
            catch (Exception ex)
            {
                Log("error", "Reader error: " + ex.Message);
                DropCard();
                ReleaseContext();
                IdleWait(2000);
            }
        }
    }

    // Sleep while still answering feedback requests (so they fail fast).
    static void IdleWait(int ms)
    {
        DateTime until = DateTime.UtcNow.AddMilliseconds(ms);
        while (DateTime.UtcNow < until)
        {
            ProcessJobs(null);
            Thread.Sleep(100);
        }
    }

    static void ReleaseContext()
    {
        if (Ctx != IntPtr.Zero)
        {
            try { SCardReleaseContext(Ctx); } catch (Exception) { }
            Ctx = IntPtr.Zero;
        }
    }

    static string FindReader()
    {
        int len = 0;
        int rc = SCardListReaders(Ctx, null, null, ref len);
        if (rc != 0 || len <= 0) return null;
        byte[] buf = new byte[len * 2];
        rc = SCardListReaders(Ctx, null, buf, ref len);
        if (rc != 0) return null;
        string[] names = Encoding.Unicode.GetString(buf, 0, len * 2).Split(new char[] { '\0' }, StringSplitOptions.RemoveEmptyEntries);
        foreach (string n in names) if (n.IndexOf("ACR122", StringComparison.OrdinalIgnoreCase) >= 0) return n;
        foreach (string n in names) if (n.IndexOf("PICC", StringComparison.OrdinalIgnoreCase) >= 0) return n;
        return names.Length > 0 ? names[0] : null;
    }

    static void WatchReader(string reader)
    {
        SCARD_READERSTATE[] states = new SCARD_READERSTATE[1];
        states[0].szReader = reader;
        states[0].dwCurrentState = SCARD_STATE_UNAWARE;
        states[0].rgbAtr = new byte[36];
        bool present = false;
        while (true)
        {
            ProcessJobs(reader);
            int rc = SCardGetStatusChange(Ctx, 150, states, 1);
            if (rc == SCARD_E_TIMEOUT) continue;
            if (rc != 0)
            {
                Log("warn", "Reader disconnected (" + Hex(rc) + ")");
                DropCard();
                SetReader(null);
                ReleaseContext();
                return;
            }
            uint ev = states[0].dwEventState;
            states[0].dwCurrentState = ev & ~SCARD_STATE_CHANGED;
            if ((ev & SCARD_STATE_UNAVAILABLE) != 0)
            {
                Log("warn", "Reader unplugged");
                DropCard();
                SetReader(null);
                ReleaseContext();
                IdleWait(1000);
                return;
            }
            bool nowPresent = (ev & SCARD_STATE_PRESENT) != 0 && (ev & SCARD_STATE_MUTE) == 0;
            if (nowPresent && !present)
            {
                present = true;
                int n = (int)Math.Min(states[0].cbAtr, 36u);
                byte[] atr = new byte[n];
                Array.Copy(states[0].rgbAtr, atr, n);
                OnCard(reader, atr);
            }
            else if (!nowPresent && present)
            {
                present = false;
                DropCard();
                Broadcast("{\"type\":\"removed\"}");
            }
        }
    }

    static void OnCard(string reader, byte[] atr)
    {
        IntPtr h;
        uint proto;
        int rc = SCardConnect(Ctx, reader, SCARD_SHARE_SHARED, SCARD_PROTOCOL_T0 | SCARD_PROTOCOL_T1, out h, out proto);
        if (rc != 0)
        {
            Log("warn", "Couldn't talk to the card (" + Hex(rc) + ") - hold it flat and still");
            return;
        }
        CardHandle = h;
        CardProto = proto;

        // Turn off the reader's own beep on every tap, so a beep means the
        // app accepted the card (one beep) or refused it (two beeps).
        if (!BuzzerConfigured && reader.IndexOf("ACR122", StringComparison.OrdinalIgnoreCase) >= 0)
        {
            Transmit(new byte[] { 0xFF, 0x00, 0x52, 0x00, 0x00 }, true);
            BuzzerConfigured = true;
        }

        byte[] resp = Transmit(new byte[] { 0xFF, 0xCA, 0x00, 0x00, 0x00 }, true);
        if (resp == null || resp.Length < 3 || resp[resp.Length - 2] != 0x90 || resp[resp.Length - 1] != 0x00)
        {
            Log("warn", "Couldn't read the card ID - try again");
            return;
        }
        string uid = Hex(resp, 0, resp.Length - 2, "");
        string type = CardType(atr);
        Log("ok", "Card " + uid + " (" + type + ")");
        Broadcast("{\"type\":\"card\",\"uid\":\"" + uid + "\",\"atr\":\"" + Hex(atr, 0, atr.Length, "") + "\",\"cardType\":" + Json(type) + ",\"reader\":" + Json(reader) + "}");
    }

    static void DropCard()
    {
        if (CardHandle != IntPtr.Zero)
        {
            try { SCardDisconnect(CardHandle, SCARD_LEAVE_CARD); } catch (Exception) { }
            CardHandle = IntPtr.Zero;
        }
    }

    static byte[] Transmit(byte[] apdu, bool log)
    {
        if (CardHandle == IntPtr.Zero) return null;
        SCARD_IO_REQUEST pci = new SCARD_IO_REQUEST();
        pci.dwProtocol = CardProto;
        pci.cbPciLength = 8;
        byte[] recv = new byte[258];
        int recvLen = recv.Length;
        if (log) Log("apdu", "> " + Hex(apdu, 0, apdu.Length, " "));
        int rc = SCardTransmit(CardHandle, ref pci, apdu, apdu.Length, IntPtr.Zero, recv, ref recvLen);
        if (rc != 0)
        {
            if (log) Log("warn", "< error " + Hex(rc));
            return null;
        }
        byte[] outp = new byte[recvLen];
        Array.Copy(recv, outp, recvLen);
        if (log) Log("apdu", "< " + Hex(outp, 0, outp.Length, " "));
        return outp;
    }

    // LED / buzzer when no card is on the reader: the CCID escape command.
    static string SendEscape(string reader, byte[] apdu)
    {
        IntPtr h;
        uint p;
        int rc = SCardConnect(Ctx, reader, SCARD_SHARE_DIRECT, 0, out h, out p);
        if (rc != 0) return "direct connect " + Hex(rc);
        byte[] outBuf = new byte[64];
        int ret;
        rc = SCardControl(h, IOCTL_CCID_ESCAPE, apdu, apdu.Length, outBuf, outBuf.Length, out ret);
        SCardDisconnect(h, SCARD_LEAVE_CARD);
        return rc == 0 ? null : "escape " + Hex(rc);
    }

    static void ProcessJobs(string reader)
    {
        while (true)
        {
            Job job = null;
            lock (JobsLock) { if (Jobs.Count > 0) job = Jobs.Dequeue(); }
            if (job == null) break;
            try
            {
                if (reader == null) job.Error = "no reader";
                else if (CardHandle != IntPtr.Zero)
                {
                    byte[] r = Transmit(job.Apdu, true);
                    job.Ok = r != null && r.Length >= 2 && r[r.Length - 2] == 0x90;
                    if (!job.Ok) job.Error = r == null ? "no response" : Hex(r, 0, r.Length, " ");
                }
                else
                {
                    Log("apdu", "> (escape) " + Hex(job.Apdu, 0, job.Apdu.Length, " "));
                    string err = SendEscape(reader, job.Apdu);
                    job.Ok = err == null;
                    job.Error = err;
                }
            }
            catch (Exception ex) { job.Error = ex.Message; }
            job.Done.Set();
        }

        long idle = Interlocked.Read(ref IdleAtTicks);
        if (idle != 0 && reader != null && DateTime.UtcNow.Ticks >= idle)
        {
            Interlocked.Exchange(ref IdleAtTicks, 0);
            byte[] a = FeedbackApdu("idle", false, true);
            try
            {
                if (CardHandle != IntPtr.Zero) Transmit(a, false);
                else SendEscape(reader, a);
            }
            catch (Exception) { }
        }
    }

    static void SimulatedLoop()
    {
        SetReader("ACS ACR122U PICC Interface (simulated)");
        Log("ok", "Simulated reader ready - use /simulate?uid=... to tap a card");
        while (true)
        {
            while (true)
            {
                Job job = null;
                lock (JobsLock) { if (Jobs.Count > 0) job = Jobs.Dequeue(); }
                if (job == null) break;
                Log("apdu", "> " + Hex(job.Apdu, 0, job.Apdu.Length, " "));
                Log("apdu", "< 90 00");
                job.Ok = true;
                job.Done.Set();
            }
            Thread.Sleep(50);
        }
    }

    static byte[] FeedbackApdu(string kind, bool beep, bool led)
    {
        // FF 00 40 P2 04 T1 T2 repeat buzzer  (ACR122U LED and buzzer control)
        if (kind == "success")
        {
            if (!beep && !led) return null;
            return new byte[] { 0xFF, 0x00, 0x40, (byte)(led ? 0x0E : 0x00), 0x04, 0x02, 0x00, 0x01, (byte)(beep ? 0x01 : 0x00) };
        }
        if (kind == "error")
        {
            if (!beep && !led) return null;
            return new byte[] { 0xFF, 0x00, 0x40, (byte)(led ? 0x5D : 0x00), 0x04, 0x02, 0x02, 0x02, (byte)(beep ? 0x01 : 0x00) };
        }
        if (kind == "idle") return new byte[] { 0xFF, 0x00, 0x40, 0x0D, 0x04, 0x01, 0x01, 0x01, 0x00 };
        return null;
    }

    static string CardType(byte[] atr)
    {
        if (atr.Length >= 15 && atr[0] == 0x3B && atr[4] == 0x80 && atr[5] == 0x4F)
        {
            int code = (atr[13] << 8) | atr[14];
            switch (code)
            {
                case 0x0001: return "MIFARE Classic 1K";
                case 0x0002: return "MIFARE Classic 4K";
                case 0x0003: return "MIFARE Ultralight / NTAG";
                case 0x0026: return "MIFARE Mini";
                case 0xF004: return "Topaz / Jewel";
                case 0xF011: return "FeliCa 212K";
                case 0xF012: return "FeliCa 424K";
            }
            return "ISO 14443 card";
        }
        if (atr.Length >= 2 && atr[0] == 0x3B && (atr[1] & 0xF0) == 0x80) return "ISO 14443-4 card (e.g. DESFire)";
        return "NFC card";
    }

    static void SetReader(string name)
    {
        if (name == ReaderName) return;
        ReaderName = name;
        Broadcast(StatusJson());
    }

    static string StatusJson()
    {
        return "{\"type\":\"status\",\"reader\":" + Json(ReaderName) + ",\"version\":\"" + Version + "\",\"simulate\":" + (Simulate ? "true" : "false") + "}";
    }

    // -------------------------------------------------------------------- http

    static void AcceptLoop(TcpListener listener)
    {
        while (true)
        {
            try
            {
                TcpClient c = listener.AcceptTcpClient();
                Thread t = new Thread(delegate () { Handle(c); });
                t.IsBackground = true;
                t.Start();
            }
            catch (Exception) { Thread.Sleep(200); }
        }
    }

    static void Handle(TcpClient client)
    {
        bool keepOpen = false;
        try
        {
            client.NoDelay = true;
            NetworkStream s = client.GetStream();
            s.ReadTimeout = 5000;
            string head = ReadHead(s);
            if (head == null) return;
            string[] lines = head.Split(new string[] { "\r\n" }, StringSplitOptions.None);
            string[] first = lines[0].Split(' ');
            if (first.Length < 2) return;
            string method = first[0].ToUpperInvariant();
            string target = first[1];
            string origin = null;
            for (int i = 1; i < lines.Length; i++)
            {
                int colon = lines[i].IndexOf(':');
                if (colon > 0 && lines[i].Substring(0, colon).Trim().Equals("Origin", StringComparison.OrdinalIgnoreCase))
                    origin = lines[i].Substring(colon + 1).Trim();
            }
            string path = target;
            string query = "";
            int qi = target.IndexOf('?');
            if (qi >= 0) { path = target.Substring(0, qi); query = target.Substring(qi + 1); }

            bool allowed = OriginAllowed(origin);
            if (!allowed && !string.IsNullOrEmpty(origin) && (path == "/events" || path == "/status")) WarnOrigin(origin);
            string cors = allowed
                ? "Access-Control-Allow-Origin: " + origin + "\r\nVary: Origin\r\nAccess-Control-Allow-Private-Network: true\r\n"
                : "";

            if (method == "OPTIONS")
            {
                WriteText(s, "HTTP/1.1 204 No Content\r\n" + cors +
                    "Access-Control-Allow-Methods: GET, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nAccess-Control-Max-Age: 600\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                return;
            }
            if (method != "GET") { Respond(s, 405, cors, "{\"error\":\"GET only\"}"); return; }

            if (path == "/events")
            {
                if (!allowed) { Respond(s, 403, cors, "{\"error\":\"This website isn't allowed to use the card reader.\"}"); return; }
                WriteText(s, "HTTP/1.1 200 OK\r\n" + cors +
                    "Content-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: keep-alive\r\n\r\nretry: 2000\n\n");
                s.ReadTimeout = Timeout.Infinite;
                lock (ClientsLock)
                {
                    SendEvent(s, StatusJson());
                    Clients.Add(s);
                }
                keepOpen = true;
                Log("info", "TransitTrack page connected");
                return;
            }
            if (path == "/status")
            {
                if (!allowed) { Respond(s, 403, cors, "{\"error\":\"origin not allowed\"}"); return; }
                Respond(s, 200, cors, StatusJson());
                return;
            }
            if (path == "/feedback" || path == "/result")
            {
                string kind = path == "/result"
                    ? (Param(query, "ok") == "1" ? "success" : "error")
                    : (Param(query, "kind") ?? "success");
                bool beep = Param(query, "beep") != "0";
                bool led = Param(query, "led") != "0";
                Respond(s, 200, cors, RunFeedback(kind, beep, led));
                return;
            }
            if (path == "/simulate" && Simulate)
            {
                string uid = (Param(query, "uid") ?? "").ToUpperInvariant();
                string type = Param(query, "type") ?? "MIFARE Classic 1K";
                Log("ok", "Card " + uid + " (" + type + ") [simulated]");
                Broadcast("{\"type\":\"card\",\"uid\":" + Json(uid) + ",\"atr\":\"\",\"cardType\":" + Json(type) + ",\"reader\":" + Json(ReaderName) + "}");
                Respond(s, 200, cors, "{\"ok\":true}");
                return;
            }
            if (path == "/")
            {
                Respond(s, 200, cors, "{\"name\":\"TransitTrack Card Reader\",\"version\":\"" + Version + "\"}");
                return;
            }
            Respond(s, 404, cors, "{\"error\":\"not found\"}");
        }
        catch (Exception) { }
        finally
        {
            if (!keepOpen) { try { client.Close(); } catch (Exception) { } }
        }
    }

    static string RunFeedback(string kind, bool beep, bool led)
    {
        byte[] apdu = FeedbackApdu(kind, beep, led);
        if (apdu == null) return "{\"ok\":true,\"skipped\":true}";
        string apduHex = Hex(apdu, 0, apdu.Length, " ");
        if (ReaderName == null) return "{\"ok\":false,\"error\":\"no reader\",\"apdu\":\"" + apduHex + "\"}";
        Job job = new Job();
        job.Apdu = apdu;
        lock (JobsLock) Jobs.Enqueue(job);
        bool done = job.Done.WaitOne(2000);
        if (kind == "success" || kind == "error")
            Interlocked.Exchange(ref IdleAtTicks, DateTime.UtcNow.AddMilliseconds(kind == "error" ? 2200 : 1600).Ticks);
        string err = !done ? "timeout" : job.Error;
        return "{\"ok\":" + (done && job.Ok ? "true" : "false") + ",\"apdu\":\"" + apduHex + "\"" + (err != null ? ",\"error\":" + Json(err) : "") + "}";
    }

    static readonly List<string> WarnedOrigins = new List<string>();
    static void WarnOrigin(string origin)
    {
        lock (WarnedOrigins)
        {
            if (WarnedOrigins.Contains(origin)) return;
            WarnedOrigins.Add(origin);
        }
        Log("warn", "Refused a connection from " + origin + " - open TransitTrack at https://eager-transit-track-go.base44.app instead");
    }

    static bool OriginAllowed(string origin)
    {
        if (string.IsNullOrEmpty(origin)) return false;
        string o = origin.TrimEnd('/');
        foreach (string a in AllowedOrigins) if (string.Equals(a, o, StringComparison.OrdinalIgnoreCase)) return true;
        Uri u;
        if (!Uri.TryCreate(o, UriKind.Absolute, out u)) return false;
        if (u.Scheme == "https" && u.Host.EndsWith(".base44.app", StringComparison.OrdinalIgnoreCase)) return true;
        if (u.Scheme == "http" && (u.Host == "localhost" || u.Host == "127.0.0.1")) return true;
        return false;
    }

    static string ReadHead(Stream s)
    {
        StringBuilder sb = new StringBuilder();
        byte[] b = new byte[1];
        while (sb.Length < 8192)
        {
            int n = s.Read(b, 0, 1);
            if (n <= 0) return null;
            sb.Append((char)b[0]);
            int len = sb.Length;
            if (len >= 4 && sb[len - 4] == '\r' && sb[len - 3] == '\n' && sb[len - 2] == '\r' && sb[len - 1] == '\n')
                return sb.ToString(0, len - 4);
        }
        return null;
    }

    static void Respond(Stream s, int code, string cors, string json)
    {
        string reason = code == 200 ? "OK" : code == 403 ? "Forbidden" : code == 404 ? "Not Found" : code == 405 ? "Method Not Allowed" : "Error";
        byte[] body = Encoding.UTF8.GetBytes(json);
        WriteText(s, "HTTP/1.1 " + code + " " + reason + "\r\n" + cors +
            "Content-Type: application/json\r\nCache-Control: no-store\r\nContent-Length: " + body.Length + "\r\nConnection: close\r\n\r\n");
        s.Write(body, 0, body.Length);
        s.Flush();
    }

    static void WriteText(Stream s, string text)
    {
        byte[] b = Encoding.UTF8.GetBytes(text);
        s.Write(b, 0, b.Length);
        s.Flush();
    }

    static void SendEvent(Stream s, string json)
    {
        WriteText(s, "data: " + json + "\n\n");
    }

    static void Broadcast(string json)
    {
        lock (ClientsLock)
        {
            for (int i = Clients.Count - 1; i >= 0; i--)
            {
                try { SendEvent(Clients[i], json); }
                catch (Exception)
                {
                    try { Clients[i].Close(); } catch (Exception) { }
                    Clients.RemoveAt(i);
                }
            }
        }
    }

    static void PingLoop()
    {
        while (true)
        {
            Thread.Sleep(15000);
            lock (ClientsLock)
            {
                for (int i = Clients.Count - 1; i >= 0; i--)
                {
                    try { WriteText(Clients[i], ": ping\n\n"); }
                    catch (Exception)
                    {
                        try { Clients[i].Close(); } catch (Exception) { }
                        Clients.RemoveAt(i);
                    }
                }
            }
        }
    }

    // ----------------------------------------------------------------- helpers

    static void Log(string level, string text)
    {
        ConsoleColor color = level == "error" ? ConsoleColor.Red : level == "warn" ? ConsoleColor.Yellow : level == "ok" ? ConsoleColor.Green : level == "apdu" ? ConsoleColor.DarkCyan : ConsoleColor.Gray;
        try
        {
            ConsoleColor old = Console.ForegroundColor;
            Console.ForegroundColor = color;
            Console.WriteLine("  " + DateTime.Now.ToString("HH:mm:ss") + "  " + text);
            Console.ForegroundColor = old;
        }
        catch (Exception) { }
        Broadcast("{\"type\":\"log\",\"level\":\"" + level + "\",\"text\":" + Json(text) + "}");
    }

    static string Param(string query, string name)
    {
        foreach (string part in query.Split('&'))
        {
            int eq = part.IndexOf('=');
            string k = eq >= 0 ? part.Substring(0, eq) : part;
            if (k == name) return Uri.UnescapeDataString((eq >= 0 ? part.Substring(eq + 1) : "").Replace('+', ' '));
        }
        return null;
    }

    static string Hex(int rc)
    {
        return "0x" + rc.ToString("X8");
    }

    static string Hex(byte[] data, int offset, int count, string sep)
    {
        StringBuilder sb = new StringBuilder();
        for (int i = offset; i < offset + count; i++)
        {
            if (sb.Length > 0) sb.Append(sep);
            sb.Append(data[i].ToString("X2"));
        }
        return sb.ToString();
    }

    static string Json(string s)
    {
        if (s == null) return "null";
        StringBuilder sb = new StringBuilder("\"");
        foreach (char c in s)
        {
            if (c == '"' || c == '\\') { sb.Append('\\'); sb.Append(c); }
            else if (c < 0x20) { sb.Append("\\u"); sb.Append(((int)c).ToString("x4")); }
            else sb.Append(c);
        }
        sb.Append('"');
        return sb.ToString();
    }
}
