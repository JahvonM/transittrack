package com.transittrack.app;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;

/** USB serial transport adapted from TransitTrack Helper. Delivers fixes directly to the app; no mock-location provider. */
final class UsbGpsReader implements Runnable {
    private static final int PROLIFIC = 0x067B, UBLOX = 0x1546, ACS = 0x072F;
    private static final int[] BAUDS = {4800, 9600, 38400, 115200};

    private final Context ctx;
    private final UsbManager usb;
    interface Listener { void onFix(NmeaGpsParser.Fix fix); void onStatus(String status); }
    private final Listener listener;
    private final NmeaGpsParser parser = new NmeaGpsParser();
    private String status = "";
    static final String ACTION_PERMISSION = "com.transittrack.app.USB_GPS_PERMISSION";
    private volatile boolean running = true;

    private UsbDeviceConnection con;
    private UsbInterface dataIntf, ctrlIntf;
    private UsbEndpoint in;
    private boolean prolific;
    private long waitingSince = 0, lastAsk = 0;
    // Set from the page ("GPS problem" tapped): look again now, and ask for
    // USB access straight away instead of after 15 s.
    private final Object nap = new Object();
    private volatile boolean rescanRequested = false, askNow = false;
    private int baud = 0;

    UsbGpsReader(Context c, Listener listener) {
        this.listener = listener;
        ctx = c.getApplicationContext();
        usb = (UsbManager) c.getSystemService(Context.USB_SERVICE);
    }

    void stop() { running = false; synchronized (nap) { nap.notifyAll(); } }

    void rescan() {
        askNow = true;
        synchronized (nap) { rescanRequested = true; nap.notifyAll(); }
    }

    @Override public void run() {
        while (running) {
            try {
                UsbDevice d = find();
                if (usb == null) { setGps("USB host unavailable"); sleep(3000); continue; }
                if (d == null) {
                    setGps("Not plugged in");
                    waitingSince = 0;
                    sleep(3000);
                    continue;
                }
                if (!usb.hasPermission(d)) {
                    setGps("Waiting for USB access");
                    long now = System.currentTimeMillis();
                    if (waitingSince == 0) waitingSince = now;
                    if (askNow || (now - waitingSince > 15000 && now - lastAsk > 60000)) {
                        askNow = false;
                        lastAsk = now;
                        Intent i = new Intent(ACTION_PERMISSION).setPackage(ctx.getPackageName());
                        PendingIntent pi = PendingIntent.getBroadcast(ctx, 1, i, PendingIntent.FLAG_UPDATE_CURRENT | (android.os.Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0));
                        UsbAutoAcceptService.markPending(ctx, d, "gps");
                        usb.requestPermission(d, pi);
                        android.util.Log.i("TransitTrackUsbGps", "Asked for USB access for the GPS (popup)");
                    }
                    sleep(1000);
                    continue;
                }
                waitingSince = 0;
                if (!open(d)) { sleep(5000); continue; }
                android.util.Log.i("TransitTrackUsbGps", String.format("USB GPS connected (%04X:%04X)", d.getVendorId(), d.getProductId()));
                readLoop(d);
            } catch (Exception e) {
                android.util.Log.i("TransitTrackUsbGps", "GPS error: " + e);
            }
            close();
            if (running) sleep(3000);
        }
        close();
    }

    private void setGps(String s) { if (!s.equals(status)) { status = s; listener.onStatus(s); } }

    private UsbDevice find() {
        if (usb == null) return null;
        for (UsbDevice d : usb.getDeviceList().values()) {
            int vid = d.getVendorId();
            if (vid == ACS) continue;
            if (vid == PROLIFIC || vid == UBLOX) return d;
            for (int i = 0; i < d.getInterfaceCount(); i++) {
                if (d.getInterface(i).getInterfaceClass() == UsbConstants.USB_CLASS_CDC_DATA) return d;
            }
        }
        return null;
    }

    private boolean open(UsbDevice d) {
        con = usb.openDevice(d);
        if (con == null) { setGps("Receiver unavailable - stop the separate helper and retry"); return false; }
        prolific = d.getVendorId() == PROLIFIC;
        dataIntf = null; ctrlIntf = null;
        if (prolific) {
            dataIntf = d.getInterface(0);
        } else {
            for (int i = 0; i < d.getInterfaceCount(); i++) {
                UsbInterface f = d.getInterface(i);
                if (f.getInterfaceClass() == UsbConstants.USB_CLASS_COMM && ctrlIntf == null) ctrlIntf = f;
                if (f.getInterfaceClass() == UsbConstants.USB_CLASS_CDC_DATA && dataIntf == null) dataIntf = f;
            }
            if (dataIntf == null) {
                for (int i = 0; i < d.getInterfaceCount() && dataIntf == null; i++) {
                    UsbInterface f = d.getInterface(i);
                    for (int j = 0; j < f.getEndpointCount(); j++) {
                        UsbEndpoint ep = f.getEndpoint(j);
                        if (ep.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK && ep.getDirection() == UsbConstants.USB_DIR_IN) { dataIntf = f; break; }
                    }
                }
            }
        }
        if (dataIntf == null || !con.claimInterface(dataIntf, false)) { setGps("Receiver busy - stop the separate helper and retry"); return false; }
        if (ctrlIntf != null) con.claimInterface(ctrlIntf, false);
        in = null;
        for (int j = 0; j < dataIntf.getEndpointCount(); j++) {
            UsbEndpoint ep = dataIntf.getEndpoint(j);
            if (ep.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK && ep.getDirection() == UsbConstants.USB_DIR_IN) in = ep;
        }
        if (in == null) { setGps("Unsupported USB GPS data interface"); return false; }
        if (prolific) prolificInit();
        return true;
    }

    private void close() {
        try { if (con != null && dataIntf != null) con.releaseInterface(dataIntf); } catch (Exception ignored) { }
        try { if (con != null && ctrlIntf != null) con.releaseInterface(ctrlIntf); } catch (Exception ignored) { }
        try { if (con != null) con.close(); } catch (Exception ignored) { }
        con = null; dataIntf = null; ctrlIntf = null; in = null;
    }

    // ---------- serial setup ----------

    private void prolificInit() {
        vin(0x8484, 0); vout(0x0404, 0); vin(0x8484, 0); vin(0x8383, 0); vin(0x8484, 0);
        vout(0x0404, 1); vin(0x8484, 0); vin(0x8383, 0); vout(0, 1); vout(1, 0);
        byte[] raw = con.getRawDescriptors();
        boolean hx = raw != null && raw.length > 7 && (raw[7] & 0xFF) == 64;
        vout(2, hx ? 0x44 : 0x24);
    }
    private void vin(int value, int index) { con.controlTransfer(0xC0, 0x01, value, index, new byte[1], 1, 1000); }
    private void vout(int value, int index) { con.controlTransfer(0x40, 0x01, value, index, null, 0, 1000); }

    private void setBaud(int b) {
        int index = prolific ? 0 : (ctrlIntf != null ? ctrlIntf.getId() : 0);
        byte[] lc = {(byte) b, (byte) (b >> 8), (byte) (b >> 16), (byte) (b >> 24), 0, 0, 8};
        con.controlTransfer(0x21, 0x20, 0, index, lc, lc.length, 1000);   // SET_LINE_CODING: 8N1
        con.controlTransfer(0x21, 0x22, 0x03, index, null, 0, 1000);      // DTR + RTS on
    }

    // ---------- reading NMEA ----------

    private void readLoop(UsbDevice d) {
        byte[] buf = new byte[4096];
        StringBuilder line = new StringBuilder();
        // Find the speed the receiver talks at (SiRF usually 4800, u-blox 9600).
        int found = 0;
        for (int attempt = 0; attempt < BAUDS.length + 1 && found == 0 && running; attempt++) {
            int b = attempt == 0 ? baud : BAUDS[attempt - 1];
            if (b == 0) continue;
            setBaud(b);
            StringBuilder probe = new StringBuilder();
            long end = System.currentTimeMillis() + 3000;
            while (running && System.currentTimeMillis() < end) {
                int n = con.bulkTransfer(in, buf, buf.length, 500);
                if (n > 0) probe.append(new String(buf, 0, n, java.nio.charset.StandardCharsets.US_ASCII));
                if (probe.indexOf("$G") >= 0 && probe.indexOf("\n", probe.indexOf("$G")) > 0) { found = b; break; }
            }
        }
        if (found == 0) { setGps("No data from GPS"); android.util.Log.i("TransitTrackUsbGps", "GPS sends no readable data"); sleep(5000); return; }
        baud = found;
        android.util.Log.i("TransitTrackUsbGps", "GPS talking at " + found + " baud");
        setGps("Searching for satellites");
        long lastData = System.currentTimeMillis(), lastFix = 0;
        while (running) {
            int n = con.bulkTransfer(in, buf, buf.length, 1000);
            long now = System.currentTimeMillis();
            if (n > 0) {
                lastData = now;
                for (int i = 0; i < n; i++) {
                    char ch = (char) (buf[i] & 0xFF);
                    if (ch == '\n') {
                        if (handleSentence(line.toString().trim())) lastFix = now;
                        line.setLength(0);
                    } else if (line.length() < 200) {
                        line.append(ch);
                    }
                }
            } else if (!usb.getDeviceList().containsValue(d) || now - lastData > 10000) {
                android.util.Log.i("TransitTrackUsbGps", "GPS stopped sending (unplugged?)");
                return;
            }
            if (lastFix > 0 && now - lastFix > 5000) setGps("Searching (" + parser.satellites() + " sats)");
        }
    }

    private boolean handleSentence(String sentence) {
        NmeaGpsParser.Fix fix = parser.accept(sentence, System.currentTimeMillis());
        if (fix == null) return false;
        if (!running) return false;
        listener.onFix(fix);
        setGps("Fix (" + fix.satellites + " sats)");
        return true;
    }

    /** Waits, but wakes early when the page asks for a rescan. */
    private void sleep(long ms) {
        synchronized (nap) {
            if (!rescanRequested) {
                try { nap.wait(ms); } catch (InterruptedException ignored) { }
            }
            rescanRequested = false;
        }
    }
}
