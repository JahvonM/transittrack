package com.transittrack.kioskhelper;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.location.Criteria;
import android.location.Location;
import android.location.LocationManager;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.os.Bundle;
import android.os.SystemClock;

/**
 * USB GPS receiver (VFAN / BU-353 style Prolific PL2303, u-blox, or any CDC-ACM serial GPS).
 * Reads NMEA sentences and gives the position to Android as the "gps" location provider
 * (needs: adb shell appops set com.transittrack.kioskhelper android:mock_location allow),
 * so the driver page's map uses the bus's USB GPS.
 */
final class UsbGps implements Runnable {
    private static final int PROLIFIC = 0x067B, UBLOX = 0x1546, ACS = 0x072F;
    private static final int[] BAUDS = {4800, 9600, 38400, 115200};

    private final Context ctx;
    private final UsbManager usb;
    private final LocationManager lm;
    private volatile boolean running = true;

    private UsbDeviceConnection con;
    private UsbInterface dataIntf, ctrlIntf;
    private UsbEndpoint in;
    private boolean prolific;
    private boolean providerAdded = false, providerDenied = false;
    private long waitingSince = 0, lastAsk = 0;
    private int sats = 0;
    private float hdop = 0;
    private double altitude = Double.NaN;
    private int baud = 0;

    UsbGps(Context c) {
        ctx = c.getApplicationContext();
        usb = (UsbManager) c.getSystemService(Context.USB_SERVICE);
        lm = (LocationManager) c.getSystemService(Context.LOCATION_SERVICE);
    }

    void stop() { running = false; }

    @Override public void run() {
        while (running) {
            try {
                if (HelperService.parked) { setGps("Paused (bus parked)"); sleep(3000); continue; }
                UsbDevice d = find();
                if (d == null) {
                    setGps("Not plugged in");
                    removeProvider();
                    waitingSince = 0;
                    sleep(3000);
                    continue;
                }
                Config.markSeen(ctx, "gps");
                if (!usb.hasPermission(d)) {
                    setGps("Waiting for USB access");
                    long now = System.currentTimeMillis();
                    if (waitingSince == 0) waitingSince = now;
                    if (now - waitingSince > 15000 && now - lastAsk > 60000) {
                        lastAsk = now;
                        Intent i = new Intent(CardReader.ACTION_PERMISSION).setPackage(ctx.getPackageName());
                        PendingIntent pi = PendingIntent.getBroadcast(ctx, 1, i, PendingIntent.FLAG_UPDATE_CURRENT);
                        usb.requestPermission(d, pi);
                        Status.log("Asked for USB access for the GPS (popup)");
                    }
                    sleep(1000);
                    continue;
                }
                waitingSince = 0;
                if (!open(d)) { sleep(5000); continue; }
                Status.log(String.format("USB GPS connected (%04X:%04X)", d.getVendorId(), d.getProductId()));
                readLoop(d);
            } catch (Exception e) {
                Status.log("GPS error: " + e);
            }
            close();
            if (running) sleep(3000);
        }
        close();
        removeProvider();
    }

    private void setGps(String s) { if (!s.equals(Status.gps)) Status.gps = s; }

    private UsbDevice find() {
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
        if (con == null) { Status.log("Could not open the GPS"); return false; }
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
        if (dataIntf == null || !con.claimInterface(dataIntf, true)) { Status.log("Could not claim the GPS"); return false; }
        if (ctrlIntf != null) con.claimInterface(ctrlIntf, true);
        in = null;
        for (int j = 0; j < dataIntf.getEndpointCount(); j++) {
            UsbEndpoint ep = dataIntf.getEndpoint(j);
            if (ep.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK && ep.getDirection() == UsbConstants.USB_DIR_IN) in = ep;
        }
        if (in == null) { Status.log("GPS data endpoint not found"); return false; }
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
            while (System.currentTimeMillis() < end) {
                int n = con.bulkTransfer(in, buf, buf.length, 500);
                if (n > 0) probe.append(new String(buf, 0, n, java.nio.charset.StandardCharsets.US_ASCII));
                if (probe.indexOf("$G") >= 0 && probe.indexOf("\n", probe.indexOf("$G")) > 0) { found = b; break; }
            }
        }
        if (found == 0) { setGps("No data from GPS"); Status.log("GPS sends no readable data"); sleep(5000); return; }
        baud = found;
        Status.log("GPS talking at " + found + " baud");
        setGps("Searching for satellites");
        long lastData = System.currentTimeMillis(), lastFix = 0;
        while (running) {
            if (HelperService.parked) { Status.log("GPS paused (bus parked)"); return; }
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
                Status.log("GPS stopped sending (unplugged?)");
                return;
            }
            if (lastFix > 0 && now - lastFix > 5000) setGps("Searching (" + sats + " sats)");
        }
    }

    /** Returns true when the sentence gave a valid position. */
    private boolean handleSentence(String s) {
        if (s.length() < 7 || s.charAt(0) != '$') return false;
        int star = s.indexOf('*');
        if (star > 0 && star + 3 <= s.length()) {
            int sum = 0;
            for (int i = 1; i < star; i++) sum ^= s.charAt(i);
            try { if (sum != Integer.parseInt(s.substring(star + 1, star + 3), 16)) return false; }
            catch (NumberFormatException e) { return false; }
            s = s.substring(0, star);
        }
        String[] f = s.split(",", -1);
        String type = f[0].length() >= 6 ? f[0].substring(3) : "";
        try {
            if (type.equals("GGA") && f.length > 9) {
                sats = f[7].isEmpty() ? sats : Integer.parseInt(f[7]);
                hdop = f[8].isEmpty() ? hdop : Float.parseFloat(f[8]);
                altitude = f[9].isEmpty() ? Double.NaN : Double.parseDouble(f[9]);
                if (f[6].equals("0") || f[6].isEmpty()) setGps("Searching (" + sats + " sats)");
                return false;
            }
            if (type.equals("RMC") && f.length > 8) {
                if (!"A".equals(f[2]) || f[3].isEmpty() || f[5].isEmpty()) return false;
                double lat = degrees(f[3]) * ("S".equals(f[4]) ? -1 : 1);
                double lon = degrees(f[5]) * ("W".equals(f[6]) ? -1 : 1);
                Location l = new Location(LocationManager.GPS_PROVIDER);
                l.setLatitude(lat);
                l.setLongitude(lon);
                l.setTime(System.currentTimeMillis());
                l.setElapsedRealtimeNanos(SystemClock.elapsedRealtimeNanos());
                l.setAccuracy(hdop > 0 ? Math.max(3f, hdop * 5f) : 10f);
                if (!f[7].isEmpty()) l.setSpeed((float) (Double.parseDouble(f[7]) * 0.514444));
                if (!f[8].isEmpty()) l.setBearing(Float.parseFloat(f[8]));
                if (!Double.isNaN(altitude)) l.setAltitude(altitude);
                Bundle extras = new Bundle();
                extras.putInt("satellites", sats);
                l.setExtras(extras);
                publish(l);
                return true;
            }
        } catch (RuntimeException ignored) { }
        return false;
    }

    private static double degrees(String ddmm) {
        double v = Double.parseDouble(ddmm);
        int deg = (int) (v / 100);
        return deg + (v - deg * 100) / 60.0;
    }

    private void publish(Location l) {
        if (!ensureProvider()) return;
        try {
            lm.setTestProviderLocation(LocationManager.GPS_PROVIDER, l);
            setGps("Fix (" + sats + " sats)");
        } catch (RuntimeException e) {
            providerAdded = false;
        }
    }

    private boolean ensureProvider() {
        if (providerAdded) return true;
        if (providerDenied) return false;
        try {
            try { lm.removeTestProvider(LocationManager.GPS_PROVIDER); } catch (RuntimeException ignored) { }
            lm.addTestProvider(LocationManager.GPS_PROVIDER, false, true, false, false, true, true, true,
                    Criteria.POWER_LOW, Criteria.ACCURACY_FINE);
            lm.setTestProviderEnabled(LocationManager.GPS_PROVIDER, true);
            providerAdded = true;
            Status.log("Giving the USB GPS position to Android");
            return true;
        } catch (SecurityException e) {
            providerDenied = true;
            setGps("Not allowed - see setup guide");
            Status.log("GPS position blocked: run  adb shell appops set " + ctx.getPackageName() + " android:mock_location allow  then restart the helper");
            return false;
        } catch (RuntimeException e) {
            Status.log("GPS provider error: " + e.getMessage());
            return false;
        }
    }

    private void removeProvider() {
        if (!providerAdded) return;
        try { lm.removeTestProvider(LocationManager.GPS_PROVIDER); } catch (RuntimeException ignored) { }
        providerAdded = false;
        Status.log("USB GPS position stopped");
    }

    private static void sleep(long ms) {
        try { Thread.sleep(ms); } catch (InterruptedException ignored) { }
    }
}
