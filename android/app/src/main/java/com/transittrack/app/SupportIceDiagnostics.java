package com.transittrack.app;

/** Deliberately returns counts and bounded numbers only, never candidate data. */
final class SupportIceDiagnostics {
    static String counts(String sdp) {
        int host = 0, reflexive = 0, relay = 0;
        if (sdp != null && sdp.length() <= 65536) {
            for (String line : sdp.split("\\r?\\n")) {
                if (!line.startsWith("a=candidate:")) continue;
                if (line.matches(".*\\s+typ\\s+host(?:\\s.*)?")) host++;
                else if (line.matches(".*\\s+typ\\s+srflx(?:\\s.*)?")) reflexive++;
                else if (line.matches(".*\\s+typ\\s+relay(?:\\s.*)?")) relay++;
            }
        }
        return "H" + host + "/S" + reflexive + "/R" + relay;
    }
    static int safeError(int code) { return code >= 300 && code <= 799 ? code : 0; }
}
