package com.transittrack.kioskhelper;

import android.util.Log;
import java.text.SimpleDateFormat;
import java.util.ArrayDeque;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/** Shared status for the status screen and health reports, plus a short log (also in logcat, tag TTHelper). */
final class Status {
    private Status() {}
    static volatile String power = "?";
    static volatile String screen = "-";
    static volatile String reader = "Not started";
    static volatile String delivery = "Waiting for a tap";
    static volatile String gps = "Not started";
    static volatile String hotspot = "Off";
    static volatile String wifi = "-";
    static volatile String lastCard = "-";
    static volatile String lastCardIso = null;
    private static final ArrayDeque<String> LINES = new ArrayDeque<>();

    static String now() { return new SimpleDateFormat("HH:mm:ss", Locale.US).format(new Date()); }

    static String iso(long ms) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(new Date(ms));
    }

    static synchronized void log(String msg) {
        Log.i("TTHelper", msg);
        LINES.addFirst(now() + "  " + msg);
        while (LINES.size() > 50) LINES.removeLast();
    }

    static synchronized String recent() {
        StringBuilder sb = new StringBuilder();
        for (String l : LINES) sb.append(l).append('\n');
        return sb.toString();
    }
}
