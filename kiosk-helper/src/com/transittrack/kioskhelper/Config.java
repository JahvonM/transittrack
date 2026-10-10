package com.transittrack.kioskhelper;

import android.content.Context;
import android.content.SharedPreferences;

final class Config {
    private Config() {}
    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("cfg", Context.MODE_PRIVATE); }
    static String apiKey(Context c) { return prefs(c).getString("api_key", ""); }
    static int port(Context c) { return prefs(c).getInt("port", 8080); }
    /** Legacy setup option: 1.7 keeps the screen awake on battery as well as charger. */
    static boolean ignition(Context c) { return false; }
    static boolean reader(Context c) { return prefs(c).getBoolean("reader", true); }
    static boolean gps(Context c) { return prefs(c).getBoolean("gps", true); }
    /** Driver tablets only: share the SIM's internet over the Wi-Fi hotspot while the bus runs. */
    static boolean hotspot(Context c) { return prefs(c).getBoolean("hotspot", false); }
    /** Driver tablets (Helper 1.9, from Admin): keep the hotspot on all the time, parked too. */
    static boolean hotspotAlways(Context c) { return prefs(c).getBoolean("hotspot_always", false); }
    /** Boarding tablets: the bus hotspot to join automatically (empty = not used). */
    static String joinSsid(Context c) { return prefs(c).getString("join_ssid", "").trim(); }
    static String joinPass(Context c) { return prefs(c).getString("join_pass", ""); }

    /** Remembered once a reader / GPS has ever been plugged in, so tablets without one don't report it. */
    static boolean seen(Context c, String what) { return prefs(c).getBoolean("seen_" + what, false); }
    static void markSeen(Context c, String what) {
        if (!seen(c, what)) prefs(c).edit().putBoolean("seen_" + what, true).apply();
    }
}
