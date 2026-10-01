package com.transittrack.kioskhelper;

import android.util.Log;
import java.text.SimpleDateFormat;
import java.util.ArrayDeque;
import java.util.Date;
import java.util.Locale;

/** Shared status for the status screen, plus a short in-memory log (also sent to logcat, tag TTHelper). */
final class Status {
    private Status() {}
    static volatile String power = "?";
    static volatile String screen = "-";
    static volatile String reader = "Not started";
    static volatile String lastCard = "-";
    private static final ArrayDeque<String> LINES = new ArrayDeque<>();

    static String now() { return new SimpleDateFormat("HH:mm:ss", Locale.US).format(new Date()); }

    static synchronized void log(String msg) {
        Log.i("TTHelper", msg);
        LINES.addFirst(now() + "  " + msg);
        while (LINES.size() > 40) LINES.removeLast();
    }

    static synchronized String recent() {
        StringBuilder sb = new StringBuilder();
        for (String l : LINES) sb.append(l).append('\n');
        return sb.toString();
    }
}
