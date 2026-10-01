package com.transittrack.kioskhelper;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.wifi.WifiConfiguration;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import java.util.List;

/**
 * Boarding tablets: saves the bus's hotspot (name + password set with
 *   adb shell am start -n com.transittrack.kioskhelper/.MainActivity --es join_ssid TT-BUS12 --es join_pass PASSWORD
 * ), keeps Wi-Fi on, and reconnects whenever the tablet isn't on Wi-Fi.
 * Uses the classic Wi-Fi API, allowed because the helper targets Android 9 (API 28).
 */
final class WifiJoin {
    private WifiJoin() {}

    static void ensure(Context c) {
        String ssid = Config.joinSsid(c);
        if (ssid.isEmpty()) return;
        String pass = Config.joinPass(c);
        String quoted = "\"" + ssid + "\"";
        WifiManager wm = (WifiManager) c.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        try {
            if (!wm.isWifiEnabled()) {
                boolean ok = wm.setWifiEnabled(true);
                Status.log(ok ? "Wi-Fi switched on" : "Could not switch Wi-Fi on");
            }
            int id = -1;
            List<WifiConfiguration> saved = wm.getConfiguredNetworks();
            if (saved != null) {
                for (WifiConfiguration w : saved) if (quoted.equals(w.SSID)) { id = w.networkId; break; }
            }
            String key = ssid + "|" + pass;
            String savedKey = Config.prefs(c).getString("join_saved_key", "");
            if (!key.equals(savedKey) || (id == -1 && saved != null && !saved.isEmpty())) {
                if (id != -1) wm.removeNetwork(id);
                WifiConfiguration w = new WifiConfiguration();
                w.SSID = quoted;
                if (pass.isEmpty()) {
                    w.allowedKeyManagement.set(WifiConfiguration.KeyMgmt.NONE);
                } else {
                    w.preSharedKey = "\"" + pass + "\"";
                    w.allowedKeyManagement.set(WifiConfiguration.KeyMgmt.WPA_PSK);
                }
                id = wm.addNetwork(w);
                if (id == -1) {
                    Status.wifi = "Could not save " + ssid;
                    Status.log("Could not save the bus hotspot " + ssid + " (check the name/password)");
                    return;
                }
                wm.enableNetwork(id, false);
                wm.saveConfiguration();
                Config.prefs(c).edit().putString("join_saved_key", key).apply();
                Status.log("Saved the bus hotspot " + ssid + " - the tablet will join it automatically");
            }

            ConnectivityManager cm = (ConnectivityManager) c.getSystemService(Context.CONNECTIVITY_SERVICE);
            NetworkInfo ni = cm.getActiveNetworkInfo();
            boolean onWifi = ni != null && ni.isConnected() && ni.getType() == ConnectivityManager.TYPE_WIFI;
            WifiInfo info = wm.getConnectionInfo();
            String current = info != null ? info.getSSID() : null;
            if (onWifi && quoted.equals(current)) {
                if (!Status.wifi.startsWith("Connected")) Status.log("Connected to the bus hotspot " + ssid);
                Status.wifi = "Connected to " + ssid;
            } else if (onWifi && current != null && !"<unknown ssid>".equals(current)) {
                Status.wifi = "On " + current.replace("\"", "");
            } else {
                Status.wifi = "Looking for " + ssid;
                if (id != -1) wm.enableNetwork(id, false);
                wm.reconnect();
            }
        } catch (SecurityException e) {
            Status.wifi = "Blocked";
            Status.log("Wi-Fi join blocked: run  adb shell pm grant " + c.getPackageName() + " android.permission.ACCESS_FINE_LOCATION");
        } catch (RuntimeException e) {
            Status.log("Wi-Fi join error: " + e.getMessage());
        }
    }
}
