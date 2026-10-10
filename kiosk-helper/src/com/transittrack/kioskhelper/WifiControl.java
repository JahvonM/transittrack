package com.transittrack.kioskhelper;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.wifi.ScanResult;
import android.net.wifi.WifiConfiguration;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Boarding tablets, from Admin -> Kiosk tablets (Helper 1.9):
 *  - scan: list the Wi-Fi networks around the tablet (name, signal, open or password)
 *  - join: switch to a chosen network. It then becomes the network the helper keeps
 *    the tablet on (WifiJoin). If it hasn't connected within 45 s (wrong password,
 *    out of range) the tablet goes back to the network it was using, so a mistake
 *    can't leave the boarding tablet offline.
 * Uses the classic Wi-Fi API, allowed because the helper targets Android 9 (API 28).
 */
final class WifiControl {
    private WifiControl() {}

    private static final long JOIN_WAIT_MS = 45000;
    private static final int MAX_NETWORKS = 25;
    private static final Object JOIN_LOCK = new Object();

    /** Latest scan and join attempt, reported in the helper's health. */
    static volatile JSONArray networks = null;
    static volatile long scannedAt = 0;
    static volatile String joinId = "";
    static volatile String joinSsid = "";
    static volatile String joinState = "";
    static volatile String joinMessage = "";
    static volatile long joinAt = 0;

    private static WifiManager wm(Context c) {
        return (WifiManager) c.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
    }

    /** Signal as 0-4 bars. */
    static int bars(int rssi) { return WifiManager.calculateSignalLevel(rssi, 5); }

    /** "open", "password", or "unsupported" (company/enterprise log-in, WEP, WPA3-only). */
    static String lock(String caps) {
        String s = caps == null ? "" : caps;
        if (s.contains("EAP") || s.contains("WEP")) return "unsupported";
        if (s.contains("PSK")) return "password";
        if (s.contains("SAE") || s.contains("OWE")) return "unsupported";
        return "open";
    }

    /** The Wi-Fi network the tablet is connected to now, or "". */
    static String currentSsid(Context c) {
        try {
            ConnectivityManager cm = (ConnectivityManager) c.getSystemService(Context.CONNECTIVITY_SERVICE);
            NetworkInfo ni = cm.getActiveNetworkInfo();
            if (ni == null || !ni.isConnected() || ni.getType() != ConnectivityManager.TYPE_WIFI) return "";
            WifiInfo info = wm(c).getConnectionInfo();
            String s = info == null ? null : info.getSSID();
            if (s == null || "<unknown ssid>".equals(s)) return "";
            if (s.length() >= 2 && s.startsWith("\"") && s.endsWith("\"")) s = s.substring(1, s.length() - 1);
            return s;
        } catch (Exception e) {
            return "";
        }
    }

    static int currentBars(Context c) {
        try {
            WifiInfo info = wm(c).getConnectionInfo();
            return info == null ? 0 : bars(info.getRssi());
        } catch (Exception e) {
            return 0;
        }
    }

    /** Looks for networks (Android allows only a few scans every 2 minutes; then the latest list is used). */
    static void scan(Context c) {
        WifiManager w = wm(c);
        try {
            if (!w.isWifiEnabled()) w.setWifiEnabled(true);
            boolean started = w.startScan();
            try { Thread.sleep(started ? 6000 : 1500); } catch (InterruptedException e) { return; }
            List<ScanResult> results = w.getScanResults();
            Map<String, ScanResult> best = new HashMap<>();
            if (results != null) {
                for (ScanResult r : results) {
                    String ssid = r.SSID == null ? "" : r.SSID;
                    if (ssid.trim().isEmpty() || ssid.length() > 32) continue;
                    ScanResult prev = best.get(ssid);
                    if (prev == null || r.level > prev.level) best.put(ssid, r);
                }
            }
            List<ScanResult> list = new ArrayList<>(best.values());
            Collections.sort(list, new Comparator<ScanResult>() {
                @Override public int compare(ScanResult a, ScanResult b) { return b.level - a.level; }
            });
            JSONArray out = new JSONArray();
            for (int i = 0; i < list.size() && i < MAX_NETWORKS; i++) {
                ScanResult r = list.get(i);
                JSONObject o = new JSONObject();
                o.put("ssid", r.SSID);
                o.put("bars", bars(r.level));
                o.put("lock", lock(r.capabilities));
                out.put(o);
            }
            networks = out;
            scannedAt = System.currentTimeMillis();
            Status.log("Wi-Fi scan: " + out.length() + " networks"
                    + (started ? "" : " (Android limits scans; showing its latest list)"));
        } catch (SecurityException e) {
            Status.log("Wi-Fi scan blocked: run  adb shell pm grant " + c.getPackageName()
                    + " android.permission.ACCESS_FINE_LOCATION  and turn Location on");
        } catch (Exception e) {
            Status.log("Wi-Fi scan error: " + e.getMessage());
        }
    }

    private static int networkId(WifiManager w, String ssid) {
        if (ssid == null || ssid.isEmpty()) return -1;
        String quoted = "\"" + ssid + "\"";
        List<WifiConfiguration> saved = w.getConfiguredNetworks();
        if (saved == null) return -1;
        for (WifiConfiguration n : saved) if (quoted.equals(n.SSID)) return n.networkId;
        return -1;
    }

    /** Lets Android use every saved network again (others stay as backups). */
    private static void enableAll(WifiManager w) {
        List<WifiConfiguration> saved = w.getConfiguredNetworks();
        if (saved == null) return;
        for (WifiConfiguration n : saved) w.enableNetwork(n.networkId, false);
    }

    private static boolean waitFor(Context c, String ssid, long ms) {
        long end = System.currentTimeMillis() + ms;
        while (System.currentTimeMillis() < end) {
            try { Thread.sleep(2000); } catch (InterruptedException e) { return false; }
            if (ssid.equals(currentSsid(c))) return true;
        }
        return false;
    }

    private static void state(String state, String message, Runnable report) {
        joinState = state;
        joinMessage = message;
        joinAt = System.currentTimeMillis();
        if (report != null) report.run();
    }

    /** Switches to ssid (pass "" for an open network); falls back to the previous network on failure. */
    static void join(Context c, String id, String ssid, String pass, Runnable report) {
        synchronized (JOIN_LOCK) {
            joinId = id == null ? "" : id;
            joinSsid = ssid;
            state("joining", "Connecting to " + ssid + "...", report);
            Status.log("Admin asked this tablet to join " + ssid);
            SharedPreferences p = Config.prefs(c);
            String prevSsid = Config.joinSsid(c);
            String prevPass = Config.joinPass(c);
            String wasOn = currentSsid(c);
            WifiManager w = wm(c);
            try {
                p.edit().putString("join_ssid", ssid).putString("join_pass", pass).putString("join_saved_key", "").commit();
                WifiJoin.ensure(c);
                int newId = networkId(w, ssid);
                boolean ok = false;
                if (newId != -1) {
                    w.enableNetwork(newId, true);   // switch now, even from a working network
                    w.reconnect();
                    ok = waitFor(c, ssid, JOIN_WAIT_MS);
                }
                enableAll(w);
                if (ok) {
                    Status.wifi = "Connected to " + ssid;
                    Status.log("Connected to " + ssid + " (chosen in Admin)");
                    state("connected", "Connected to " + ssid, report);
                    return;
                }
                // Didn't work: go back to what the tablet was using.
                p.edit().putString("join_ssid", prevSsid).putString("join_pass", prevPass).putString("join_saved_key", "").commit();
                if (newId != -1 && !ssid.equals(prevSsid) && !ssid.equals(wasOn)) {
                    w.removeNetwork(newId);
                    w.saveConfiguration();
                }
                WifiJoin.ensure(c);
                String back = !prevSsid.isEmpty() ? prevSsid : wasOn;
                int backId = networkId(w, back);
                boolean backOk = false;
                if (backId != -1) {
                    w.enableNetwork(backId, true);
                    w.reconnect();
                    backOk = waitFor(c, back, 30000);
                    enableAll(w);
                }
                String why = newId == -1 ? "Couldn't save " + ssid + " (check the password)"
                        : "Couldn't connect to " + ssid + " (wrong password or out of range)";
                Status.log(why + (backOk ? "; back on " + back : ""));
                state("failed", why + (backOk ? ". Went back to " + back + "." : "."), report);
            } catch (SecurityException e) {
                Status.log("Wi-Fi change blocked: run  adb shell pm grant " + c.getPackageName() + " android.permission.ACCESS_FINE_LOCATION");
                state("failed", "Wi-Fi change blocked on this tablet (location permission).", report);
            } catch (RuntimeException e) {
                Status.log("Wi-Fi change error: " + e.getMessage());
                state("failed", "Wi-Fi change error on the tablet.", report);
            }
        }
    }
}
