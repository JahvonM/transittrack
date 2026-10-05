package com.transittrack.kioskhelper;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import java.io.IOException;
import java.util.Arrays;

/**
 * ACR122U over USB CCID. Same protocol as the old Termux bridge:
 * IccPowerOn, then "Get UID" (FF CA) or the NFC chip's InListPassiveTarget (FF 00 ... D4 4A).
 */
final class CardReader implements Runnable {
    static final int ACS_VENDOR = 0x072F;
    static final String ACTION_PERMISSION = "com.transittrack.kioskhelper.USB_PERMISSION";

    private final Context ctx;
    private final UsbManager usb;
    private final ResultServer results;
    private volatile boolean running = true;
    private volatile boolean reconnectRequested = false;

    private UsbDevice device;
    private UsbDeviceConnection con;
    private UsbInterface intf;
    private UsbEndpoint in, out;
    private int seq = 0;
    private long lastAnnounce = 0, waitingSince = 0, lastAsk = 0;

    CardReader(Context ctx, ResultServer results) {
        this.ctx = ctx.getApplicationContext();
        this.usb = (UsbManager) ctx.getSystemService(Context.USB_SERVICE);
        this.results = results;
    }

    void stop() { running = false; }
    void reconnect() { reconnectRequested = true; }

    @Override public void run() {
        while (running) {
            try {
                reconnectRequested = false;
                UsbDevice d = find();
                if (d == null) {
                    setReader("Not plugged in");
                    waitingSince = 0;
                    sleep(2000);
                    continue;
                }
                if (!usb.hasPermission(d)) {
                    setReader("Waiting for USB access");
                    long now = System.currentTimeMillis();
                    if (waitingSince == 0) waitingSince = now;
                    // Normally Android grants access by itself ("Use by default" ticked).
                    // If it hasn't after 15 s, ask with the popup, at most once a minute.
                    if (now - waitingSince > 15000 && now - lastAsk > 60000) {
                        lastAsk = now;
                        Intent i = new Intent(ACTION_PERMISSION).setPackage(ctx.getPackageName());
                        PendingIntent pi = PendingIntent.getBroadcast(ctx, 0, i, PendingIntent.FLAG_UPDATE_CURRENT);
                        usb.requestPermission(d, pi);
                        Status.log("Asked for USB access (popup)");
                    }
                    sleep(1000);
                    continue;
                }
                waitingSince = 0;
                Config.markSeen(ctx, "reader");
                if (!open(d)) { close(); setReader("Reconnecting"); sleep(3000); continue; }
                Status.log("Card reader connected");
                setReader("Connected");
                readLoop();
            } catch (Exception e) {
                Status.log("Reader error: " + e);
            }
            close();
            if (running) { setReader("Reconnecting"); sleep(2000); }
        }
        close();
    }

    private void setReader(String s) {
        if (!s.equals(Status.reader)) Status.reader = s;
    }

    private UsbDevice find() {
        UsbDevice fallback = null;
        for (UsbDevice d : usb.getDeviceList().values()) {
            if (d.getVendorId() != ACS_VENDOR) continue;
            for (int i = 0; i < d.getInterfaceCount(); i++) {
                if (d.getInterface(i).getInterfaceClass() == UsbConstants.USB_CLASS_CSCID) return d;
            }
            fallback = d;
        }
        return fallback;
    }

    private boolean open(UsbDevice d) {
        device = d;
        con = usb.openDevice(d);
        if (con == null) { Status.log("Could not open the reader"); return false; }
        intf = null;
        for (int i = 0; i < d.getInterfaceCount(); i++) {
            if (d.getInterface(i).getInterfaceClass() == UsbConstants.USB_CLASS_CSCID) { intf = d.getInterface(i); break; }
        }
        if (intf == null && d.getInterfaceCount() > 0) intf = d.getInterface(0);
        if (intf == null || !con.claimInterface(intf, true)) { Status.log("Could not claim the reader"); return false; }
        in = null; out = null;
        for (int j = 0; j < intf.getEndpointCount(); j++) {
            UsbEndpoint ep = intf.getEndpoint(j);
            if (ep.getType() != UsbConstants.USB_ENDPOINT_XFER_BULK) continue;
            if (ep.getDirection() == UsbConstants.USB_DIR_IN) in = ep; else out = ep;
        }
        if (in == null || out == null) { Status.log("Reader endpoints not found"); return false; }
        seq = 0;
        return true;
    }

    private void close() {
        try { if (con != null && intf != null) con.releaseInterface(intf); } catch (Exception ignored) { }
        try { if (con != null) con.close(); } catch (Exception ignored) { }
        con = null; device = null; intf = null; in = null; out = null;
    }

    private void readLoop() {
        boolean armed = true, first = true;
        int misses = 0, fails = 0;
        while (running) {
            if (reconnectRequested) { Status.log("Reopening scanner after wake"); return; }
            if (device == null || !usb.getDeviceList().containsKey(device.getDeviceName())) {
                Status.log("Card reader unplugged; looking for scanner");
                return;
            }
            String uid;
            try {
                uid = readCard();
            } catch (IOException e) {
                if (++fails > 5) { Status.log("Reader stopped answering (unplugged?)"); return; }
                sleep(500);
                continue;
            }
            fails = 0;
            if (first) {
                first = false;
                ledReady();
                Status.log("Reader ready for cards");
            }
            long now = System.currentTimeMillis();
            if (now - lastAnnounce > 60000 && Kiosk.announce(ctx)) lastAnnounce = now;
            if (uid != null) {
                misses = 0;
                if (armed) { armed = false; handleCard(uid); }
            } else if (++misses >= 2) {
                armed = true;  // card taken away, ready for the next tap
            }
            sleep(HelperService.plugged || !Config.ignition(ctx) ? 300 : 1000);
        }
    }

    private void handleCard(String uid) {
        Status.lastCard = "Tap detected (" + Status.now() + ")";
        Status.lastCardIso = Status.iso(System.currentTimeMillis());
        ledRead();
        Status.delivery = "Sending tap to boarding page";
        results.arm();
        String tapId = "tap-" + System.currentTimeMillis();
        boolean sent = Kiosk.badge(ctx, uid, tapId);
        Boolean ok = sent ? results.await(5000) : null;
        if (ok == null) {
            Status.log("Retrying card delivery to boarding page");
            sent = Kiosk.badge(ctx, uid, tapId);
            ok = sent ? results.await(5000) : null;
        }
        if (ok == null) {
            Status.delivery = sent ? "Page did not acknowledge; tap again" : "FreeKiosk unreachable; check REST API";
            Status.log(Status.delivery);
            ledRejected(); // A REST response is not confirmation that the app received the tap.
        } else if (ok) {
            Status.delivery = "Card recognized by page";
            Status.log(Status.delivery);
            ledSuccess();
        } else {
            Status.delivery = "Card rejected by page";
            Status.log(Status.delivery);
            ledRejected();
        }
    }

    // ---------- card reading ----------

    private String readCard() throws IOException {
        byte[] atr = ccid(0x62, new byte[0]);           // IccPowerOn
        if (atr == null) throw new IOException("no answer");
        String uid = null;
        if (atr.length > 2) uid = uidStandard();         // a real card ATR
        if (uid == null) uid = uidDirect();
        return uid;
    }

    private String uidStandard() {
        byte[] d = ccid(0x6F, bytes(0xFF, 0xCA, 0x00, 0x00, 0x00));
        if (d == null || d.length <= 2 || !ok(d)) return null;
        return hex(Arrays.copyOf(d, d.length - 2));
    }

    private String uidDirect() {
        byte[] d = ccid(0x6F, bytes(0xFF, 0x00, 0x00, 0x00, 0x04, 0xD4, 0x4A, 0x01, 0x00));
        if (d == null || d.length < 10 || !ok(d)) return null;
        if ((d[0] & 0xFF) != 0xD5 || (d[1] & 0xFF) != 0x4B || (d[2] & 0xFF) < 1) return null;
        int len = d[7] & 0xFF;
        if (len == 0 || 8 + len > d.length - 2) return null;
        return hex(Arrays.copyOfRange(d, 8, 8 + len));
    }

    // ---------- lights and beeper (pseudo-APDU FF 00 40) ----------

    private void led(int p2, int t1, int t2, int reps, int buzzer) {
        ccid(0x6F, bytes(0xFF, 0x00, 0x40, p2, 0x04, t1, t2, reps, buzzer));
    }
    private void ledReady() { led(0x0D, 0, 0, 0, 0); }                       // red: waiting
    private void ledRead() { led(0x0D, 1, 0, 1, 1); }                        // one short beep
    private void ledSuccess() { led(0x0E, 0, 0, 0, 0); led(0xAE, 2, 2, 5, 0); ledReady(); }  // green flashes
    private void ledRejected() { led(0x0D, 1, 1, 3, 1); led(0x5D, 2, 2, 5, 0); ledReady(); } // 3 beeps, red flashes

    // ---------- CCID transport ----------

    /** Sends one CCID command; returns the reply payload (status OK), or null. */
    private byte[] ccid(int type, byte[] data) {
        if (con == null) return null;
        seq = (seq + 1) & 0xFF;
        byte[] pkt = new byte[10 + data.length];
        pkt[0] = (byte) type;
        pkt[1] = (byte) data.length; pkt[2] = (byte) (data.length >> 8);
        pkt[3] = (byte) (data.length >> 16); pkt[4] = (byte) (data.length >> 24);
        pkt[5] = 0; pkt[6] = (byte) seq;
        System.arraycopy(data, 0, pkt, 10, data.length);
        if (con.bulkTransfer(out, pkt, pkt.length, 2000) < 0) return null;
        byte[] buf = new byte[512];
        for (int attempt = 0; attempt < 20; attempt++) {
            int n = con.bulkTransfer(in, buf, buf.length, 3000);
            if (n < 10) return null;
            if ((buf[6] & 0xFF) != seq && attempt < 3) continue;   // stale reply
            int status = buf[7] & 0xFF;
            if ((status >> 6) == 2) continue;                       // reader asked for more time
            if ((status >> 6) == 1 && type == 0x62) return new byte[0]; // power-on failed: no card answer
            int len = (buf[1] & 0xFF) | (buf[2] & 0xFF) << 8 | (buf[3] & 0xFF) << 16 | (buf[4] & 0xFF) << 24;
            len = Math.max(0, Math.min(len, n - 10));
            return Arrays.copyOfRange(buf, 10, 10 + len);
        }
        return null;
    }

    private static boolean ok(byte[] d) {
        return d.length >= 2 && (d[d.length - 2] & 0xFF) == 0x90 && d[d.length - 1] == 0x00;
    }

    private static byte[] bytes(int... v) {
        byte[] b = new byte[v.length];
        for (int i = 0; i < v.length; i++) b[i] = (byte) v[i];
        return b;
    }

    private static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02X", x & 0xFF));
        return sb.toString();
    }

    private static void sleep(long ms) {
        try { Thread.sleep(ms); } catch (InterruptedException ignored) { }
    }
}
