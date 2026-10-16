package com.transittrack.app;

import java.util.LinkedHashSet;
import java.util.Set;

/** Retains callback addresses for our single video m-line. Never persists or logs SDP. */
final class SupportIceCandidates {
    private final Set<String> candidates = new LinkedHashSet<>();

    synchronized void add(int mediaLine, String candidate) {
        if (mediaLine != 0 || candidate == null || candidate.length() > 4096
                || !candidate.startsWith("candidate:") || candidate.contains("\r")
                || candidate.contains("\n")) return;
        candidates.add("a=" + candidate);
    }

    synchronized String merge(String sdp) {
        if (sdp == null || sdp.length() > 65536) throw new IllegalArgumentException("Invalid SDP");
        String normalized = sdp.replace("\r\n", "\n");
        String[] lines = normalized.split("\n");
        int media = 0;
        boolean video = false;
        Set<String> existing = new LinkedHashSet<>();
        for (String line : lines) {
            if (line.startsWith("m=")) { media++; video = line.startsWith("m=video "); }
            if (line.startsWith("a=candidate:")) existing.add(line);
        }
        if (media != 1 || !video) throw new IllegalArgumentException("Expected one video");
        StringBuilder result = new StringBuilder();
        for (String line : lines) {
            if (line.equals("a=end-of-candidates")) continue;
            result.append(line).append("\r\n");
        }
        for (String candidate : candidates) {
            if (!existing.contains(candidate)) result.append(candidate).append("\r\n");
        }
        String merged = result.toString();
        if (merged.length() > 65536) throw new IllegalArgumentException("SDP too large");
        return merged;
    }

    static boolean ready(String sdp, boolean complete, boolean requireRelay) {
        if (sdp == null) return false;
        boolean any = false, relay = false;
        for (String line : sdp.split("\r?\n")) {
            if (line.startsWith("a=candidate:")) {
                any = true;
                if (line.matches(".*\\s typ relay(?:\\s.*)?")) relay = true;
            }
        }
        return any && (requireRelay ? relay : complete);
    }
}
