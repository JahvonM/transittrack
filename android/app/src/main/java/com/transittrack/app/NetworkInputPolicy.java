package com.transittrack.app;

import java.nio.charset.StandardCharsets;

final class NetworkInputPolicy {
    static boolean id(String id) { return id != null && id.matches("[A-Za-z0-9_-]{8,64}"); }
    static boolean ssid(String s) {
        return s != null && !s.trim().isEmpty() && s.getBytes(StandardCharsets.UTF_8).length <= 32
            && !s.matches("(?s).*[\\x00-\\x1f\\x7f].*");
    }
    static boolean password(String s) { return s != null && (s.isEmpty() || s.matches("[\\x20-\\x7e]{8,63}")); }
    static String quote(String s) { return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\""; }
    static String lock(String caps) {
        String s = caps == null ? "" : caps;
        if (s.contains("EAP") || s.contains("WEP")) return "unsupported";
        if (s.contains("PSK")) return "password";
        return s.contains("SAE") || s.contains("OWE") ? "unsupported" : "open";
    }
}
