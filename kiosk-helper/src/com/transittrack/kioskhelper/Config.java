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
}
