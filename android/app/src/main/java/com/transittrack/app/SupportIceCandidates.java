package com.transittrack.app;

import java.util.LinkedHashSet;
import java.util.Set;

/** Retains callback addresses for one explicitly selected media type. Never persists or logs SDP. */
final class SupportIceCandidates {
    private final boolean recordings;
    SupportIceCandidates() { this(false); }
    private SupportIceCandidates(boolean recordings) { this.recordings = recordings; }
    static SupportIceCandidates forRecordings() { return new SupportIceCandidates(true); }
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
        boolean expectedMedia = false;
        Set<String> existing = new LinkedHashSet<>();
        for (String line : lines) {
            if (line.startsWith("m=")) {
                media++;
                expectedMedia = recordings
                        ? line.matches("m=application [1-9][0-9]* UDP/DTLS/SCTP webrtc-datachannel")
                        : line.startsWith("m=video ");
            }
            if (line.startsWith("a=candidate:")) existing.add(line);
        }
        if (media != 1 || !expectedMedia) throw new IllegalArgumentException(recordings ? "Expected one recording data channel" : "Expected one video");
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
                if (line.matches(".*\\s+typ\\s+relay(?:\\s.*)?")) relay = true;
            }
        }
        return any && (requireRelay ? relay : complete);
    }
}
