package com.transittrack.kioskhelper;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Typeface;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.widget.ScrollView;
import android.widget.TextView;

/** Status screen. Also accepts settings from adb: --es api_key, --es port, --es ignition, --es reader. */
public class MainActivity extends Activity {
    private TextView text;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable refresh = new Runnable() {
        @Override public void run() {
            text.setText("TransitTrack Helper " + HelperService.VERSION + "\n\n"
                    + "Power:      " + Status.power + "\n"
                    + "Screen:     " + Status.screen + "\n"
                    + "Reader:     " + Status.reader + "\n"
                    + "Page:       " + Status.delivery + "\n"
                    + "Last card:  " + Status.lastCard + "\n"
                    + "USB GPS:    " + Status.gps + "\n"
                    + "Hotspot:    " + (Config.hotspot(MainActivity.this)
                            ? Status.hotspot + (Config.hotspotAlways(MainActivity.this) ? "  (always on)" : "  (while the bus runs)")
                            : "Not used") + "\n"
                    + "Bus Wi-Fi:  " + (Config.joinSsid(MainActivity.this).isEmpty() ? "Not used" : Status.wifi) + "\n"
                    + "Wi-Fi now:  " + (Config.hotspot(MainActivity.this) ? "-" : orDash(WifiControl.currentSsid(MainActivity.this)))
                    + (WifiControl.joinState.isEmpty() ? "" : "\nLast change: " + WifiControl.joinMessage) + "\n\n"
                    + "Recent:\n" + Status.recent());
            handler.postDelayed(this, 1000);
        }
    };

    private static String orDash(String s) { return s == null || s.isEmpty() ? "Not connected" : s; }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        applySettings(getIntent());
        HelperService.start(this);
        text = new TextView(this);
        text.setTypeface(Typeface.MONOSPACE);
        text.setTextSize(15);
        text.setPadding(32, 32, 32, 32);
        ScrollView sv = new ScrollView(this);
        sv.addView(text);
        setContentView(sv);
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        applySettings(intent);
    }

    private void applySettings(Intent i) {
        if (i == null) return;
        SharedPreferences.Editor e = Config.prefs(this).edit();
        boolean changed = false;
        String v;
        if ((v = i.getStringExtra("api_key")) != null) { e.putString("api_key", v); changed = true; }
        if ((v = i.getStringExtra("port")) != null) {
            try { e.putInt("port", Integer.parseInt(v.trim())); changed = true; } catch (NumberFormatException ignored) { }
        }
        if ((v = i.getStringExtra("ignition")) != null) { e.putBoolean("ignition", false); changed = true; }
        if ((v = i.getStringExtra("reader")) != null) { e.putBoolean("reader", "true".equalsIgnoreCase(v)); changed = true; }
        if ((v = i.getStringExtra("gps")) != null) { e.putBoolean("gps", "true".equalsIgnoreCase(v)); changed = true; }
        if ((v = i.getStringExtra("hotspot")) != null) { e.putBoolean("hotspot", "true".equalsIgnoreCase(v)); changed = true; }
        if ((v = i.getStringExtra("join_ssid")) != null) { e.putString("join_ssid", v.trim()); changed = true; }
        if ((v = i.getStringExtra("join_pass")) != null) { e.putString("join_pass", v); changed = true; }
        if (changed) {
            e.apply();
            Status.log("Settings saved - restarting helper");
            stopService(new Intent(this, HelperService.class));
        }
    }

    @Override protected void onResume() { super.onResume(); handler.post(refresh); }
    @Override protected void onPause() { super.onPause(); handler.removeCallbacks(refresh); }
}
