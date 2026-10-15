package com.transittrack.app;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.util.ArrayDeque;

/** A bounded, memory-only timeline of fixed status codes. Never receives UIDs/credentials. */
final class TabletDiagnostics {
    private static final ArrayDeque<JSObject> events = new ArrayDeque<>();
    private static String previous = "";
    private static long previousAt;

    static synchronized void record(String component, String code) {
        if (!component.matches("gps|reader|system") || !code.matches("[A-Z_]{2,40}")) return;
        long now = System.currentTimeMillis();
        if ((component + code).equals(previous) && now - previousAt < 30000) return;
        previous = component + code; previousAt = now;
        JSObject event = new JSObject();
        event.put("at", now); event.put("component", component); event.put("code", code);
        events.addLast(event);
        while (events.size() > 60) events.removeFirst();
    }
    static synchronized JSArray snapshot() {
        JSArray out = new JSArray();
        for (JSObject event : events) out.put(event);
        return out;
    }
}
