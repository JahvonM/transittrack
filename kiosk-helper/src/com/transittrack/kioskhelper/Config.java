package com.transittrack.kioskhelper;

import android.content.Context;
import android.content.SharedPreferences;

final class Config {
    private Config() {}
    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("cfg", Context.MODE_PRIVATE); }
    static String apiKey(Context c) { return prefs(c).getString("api_key", "GdBus-7kR4vQ9mX2wT"); }
    static int port(Context c) { return prefs(c).getInt("port", 8080); }
    static boolean ignition(Context c) { return prefs(c).getBoolean("ignition", true); }
    static boolean reader(Context c) { return prefs(c).getBoolean("reader", true); }
    static boolean gps(Context c) { return prefs(c).getBoolean("gps", true); }
    /** Driver tablets only: share the SIM's internet over the Wi-Fi hotspot while the bus runs. */
    static boolean hotspot(Context c) { return prefs(c).getBoolean("hotspot", false); }
    /** Boarding tablets: the bus hotspot to join automatically (empty = not used). */
    static String joinSsid(Context c) { return prefs(c).getString("join_ssid", "").trim(); }
    static String joinPass(Context c) { return prefs(c).getString("join_pass", ""); }

    /** Remembered once a reader / GPS has ever been plugged in, so tablets without one don't report it. */
    static boolean seen(Context c, String what) { return prefs(c).getBoolean("seen_" + what, false); }
    static void markSeen(Context c, String what) {
        if (!seen(c, what)) prefs(c).edit().putBoolean("seen_" + what, true).apply();
    }
}
