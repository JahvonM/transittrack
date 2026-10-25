package com.transittrack.app;

import android.Manifest;
import android.app.admin.DevicePolicyManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.net.wifi.ScanResult;
import android.net.wifi.WifiConfiguration;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import java.util.ArrayList;
import java.util.List;

/**
 * "Always join this hotspot" for the boarding and sign-in devices: the bus's
 * driver-tablet hotspot is saved once in kiosk settings, then the kiosk keeps
 * joining it (at start, after a restart, and every minute from the kiosk
 * watchdog). As device owner it turns Wi-Fi back on and joins directly;
 * without ownership it hands Android a suggested network, which Android joins
 * by itself when the bus is in range (it asks once to allow that).
 *
 * The password stays in this app's private storage on the device. It is
 * never sent to the web page, the server or any log.
 */
final class BusHotspot {
    static final String STORE = "tt_bus_hotspot";
    private static long lastAttempt;
    private static final long MIN_GAP_MS = 30000;

    private BusHotspot() { }

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(STORE, Context.MODE_PRIVATE); }
    static String ssid(Context c) { return prefs(c).getString("ssid", ""); }
    static boolean always(Context c) { return prefs(c).getBoolean("always", false) && !ssid(c).isEmpty(); }
    static boolean hasPassword(Context c) { return !prefs(c).getString("password", "").isEmpty(); }

    /** Device owner, an older Android, or a system app may join networks directly. */
    static boolean managed(Context c) {
        DevicePolicyManager dpm = (DevicePolicyManager) c.getSystemService(Context.DEVICE_POLICY_SERVICE);
        return Build.VERSION.SDK_INT < 29 || (dpm != null && dpm.isDeviceOwnerApp(c.getPackageName()))
            || (c.getApplicationInfo().flags & ApplicationInfo.FLAG_SYSTEM) != 0;
    }

    /** Saves the hotspot. A blank password keeps the one already saved for the same name. */
    static String save(Context c, String name, String password, boolean always) {
        String ssid = name == null ? "" : name.trim();
        if (!NetworkInputPolicy.ssid(ssid)) return "BAD_NAME";
        String keep = ssid.equals(ssid(c)) ? prefs(c).getString("password", "") : "";
        String pass = password == null || password.isEmpty() ? keep : password;
        if (!NetworkInputPolicy.password(pass)) return "BAD_PASSWORD";
        boolean ok = prefs(c).edit().putString("ssid", ssid).putString("password", pass).putBoolean("always", always)
            .remove("suggested").commit();
        if (!ok) return "STORAGE_ERROR";
        lastAttempt = 0;
        allowLocation(c);
        return "SAVED";
    }
    static boolean setAlways(Context c, boolean on) {
        lastAttempt = 0;
        return prefs(c).edit().putBoolean("always", on).commit();
    }

    /** As device owner, allow reading the Wi-Fi name (Android ties it to location access). */
    static void allowLocation(Context c) {
        if (Build.VERSION.SDK_INT < 23) return;
        try {
            DevicePolicyManager dpm = (DevicePolicyManager) c.getSystemService(Context.DEVICE_POLICY_SERVICE);
            if (dpm == null || !dpm.isDeviceOwnerApp(c.getPackageName())) return;
            dpm.setPermissionGrantState(KioskMode.admin(c), c.getPackageName(), Manifest.permission.ACCESS_FINE_LOCATION,
                DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED);
        } catch (RuntimeException ignored) { }
    }

    static WifiManager wifi(Context c) { return (WifiManager) c.getApplicationContext().getSystemService(Context.WIFI_SERVICE); }

    static String connectedSsid(Context c) {
        try {
            WifiInfo info = wifi(c).getConnectionInfo();
            String s = info == null ? null : info.getSSID();
            if (s == null || s.equals("<unknown ssid>") || s.equals(WifiManager.UNKNOWN_SSID)) return "";
            return s.startsWith("\"") && s.endsWith("\"") && s.length() >= 2 ? s.substring(1, s.length() - 1) : s;
        } catch (RuntimeException e) { return ""; }
    }
    static boolean connected(Context c) { String s = ssid(c); return !s.isEmpty() && s.equals(connectedSsid(c)); }
    static int bars(Context c) {
        try { return WifiManager.calculateSignalLevel(wifi(c).getConnectionInfo().getRssi(), 5); } catch (RuntimeException e) { return -1; }
    }

    /** Joins the saved hotspot if it should be and isn't already. Cheap to call often. */
    static String ensure(Context c) { return ensure(c, false); }
    static synchronized String ensure(Context c, boolean now) {
        if (!always(c)) return "OFF";
        WifiManager w = wifi(c);
        if (w == null) return "UNAVAILABLE";
        if (connected(c)) return "CONNECTED";
        long at = SystemClock.elapsedRealtime();
        if (!now && lastAttempt != 0 && at - lastAttempt < MIN_GAP_MS) return "WAITING";
        lastAttempt = at;
        try {
            if (managed(c)) return join(c, w);
            if (Build.VERSION.SDK_INT >= 29) return suggest(c, w);
            return "NOT_ALLOWED";
        } catch (RuntimeException e) {
            prefs(c).edit().putString("last_code", "ANDROID_ERROR").apply();
            return "ANDROID_ERROR";
        }
    }

    @SuppressWarnings("deprecation")
    private static String join(Context c, WifiManager w) {
        if (!w.isWifiEnabled() && !w.setWifiEnabled(true)) return note(c, "WIFI_OFF");
        String ssid = ssid(c), quoted = NetworkInputPolicy.quote(ssid), pass = prefs(c).getString("password", "");
        int id = -1;
        List<WifiConfiguration> saved = null;
        try { saved = w.getConfiguredNetworks(); } catch (RuntimeException ignored) { }
        if (saved != null) for (WifiConfiguration n : saved) if (quoted.equals(n.SSID)) { id = n.networkId; break; }
        if (id == -1) {
            WifiConfiguration n = new WifiConfiguration();
            n.SSID = quoted;
            if (pass.isEmpty()) n.allowedKeyManagement.set(WifiConfiguration.KeyMgmt.NONE);
            else { n.preSharedKey = NetworkInputPolicy.quote(pass); n.allowedKeyManagement.set(WifiConfiguration.KeyMgmt.WPA_PSK); }
            id = w.addNetwork(n);
            if (id == -1) return note(c, "ADD_FAILED");
        }
        if (inRange(w, ssid)) {
            // Join the bus now, then let Android use the other saved networks again later.
            List<Integer> others = new ArrayList<>();
            if (saved != null) for (WifiConfiguration n : saved) if (n.networkId != id && n.status != WifiConfiguration.Status.DISABLED) others.add(n.networkId);
            if (!w.enableNetwork(id, true)) return note(c, "JOIN_FAILED");
            w.reconnect();
            final WifiManager manager = w;
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                for (int other : others) try { manager.enableNetwork(other, false); } catch (RuntimeException ignored) { }
            }, 30000);
            return note(c, "JOINING");
        }
        w.enableNetwork(id, false);
        return note(c, "NOT_IN_RANGE");
    }

    private static boolean inRange(WifiManager w, String ssid) {
        try {
            List<ScanResult> results = w.getScanResults();
            if (results == null || results.isEmpty()) { w.startScan(); return true; } // Unknown: try anyway.
            for (ScanResult r : results) if (ssid.equals(r.SSID)) return true;
            w.startScan();
            return false;
        } catch (RuntimeException e) { return true; }
    }

    private static String suggest(Context c, WifiManager w) {
        if (Build.VERSION.SDK_INT < 29) return "NOT_ALLOWED";
        String ssid = ssid(c), pass = prefs(c).getString("password", "");
        if (ssid.equals(prefs(c).getString("suggested", ""))) return note(c, w.isWifiEnabled() ? "SUGGESTED" : "WIFI_OFF");
        android.net.wifi.WifiNetworkSuggestion.Builder b = new android.net.wifi.WifiNetworkSuggestion.Builder().setSsid(ssid);
        if (!pass.isEmpty()) b.setWpa2Passphrase(pass);
        List<android.net.wifi.WifiNetworkSuggestion> list = new ArrayList<>();
        list.add(b.setIsAppInteractionRequired(false).build());
        try { w.removeNetworkSuggestions(new ArrayList<>()); } catch (RuntimeException ignored) { }
        int status = w.addNetworkSuggestions(list);
        if (status != WifiManager.STATUS_NETWORK_SUGGESTIONS_SUCCESS && status != WifiManager.STATUS_NETWORK_SUGGESTIONS_ERROR_ADD_DUPLICATE) return note(c, "SUGGEST_FAILED");
        prefs(c).edit().putString("suggested", ssid).apply();
        return note(c, "SUGGESTED");
    }

    private static String note(Context c, String code) {
        prefs(c).edit().putString("last_code", code).apply();
        return code;
    }

    /** One line for kiosk settings. */
    static String describe(Context c) {
        if (ssid(c).isEmpty()) return "No hotspot saved yet";
        if (connected(c)) {
            int b = bars(c);
            return b >= 3 ? "Connected, strong signal" : b >= 1 ? "Connected, weak signal" : "Connected";
        }
        if (!always(c)) return "Saved, but not joining by itself";
        String code = prefs(c).getString("last_code", "");
        switch (code) {
            case "WIFI_OFF": return "Wi-Fi is off. Turn it on in Android settings.";
            case "NOT_IN_RANGE": return "Looking for " + ssid(c) + ". Is the driver tablet's hotspot on?";
            case "JOINING": return "Joining " + ssid(c) + "…";
            case "SUGGESTED": return "Android will join it when the bus is in range. Allow it if Android asks.";
            case "ADD_FAILED": case "JOIN_FAILED": case "SUGGEST_FAILED": return "Android didn't accept the hotspot. Check the name and password.";
            case "NOT_ALLOWED": return "This device can't join by itself. Make the kiosk its owner from Admin.";
            default: return "Looking for " + ssid(c) + "…";
        }
    }
}
