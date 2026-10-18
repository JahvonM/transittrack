package com.transittrack.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class SupportIceCandidatesTest {
    private static final String BASE = "v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=sendonly\r\na=ice-ufrag:test\r\n";
    private static final String RELAY = "candidate:1 1 udp 10 203.0.113.1 49199 typ relay raddr 0.0.0.0 rport 0";
    private static final String HOST = "candidate:2 1 udp 20 192.0.2.1 5000 typ host";

    @Test public void emptyCompleteWaitsForLateNetwork() {
        SupportIceCandidates c = new SupportIceCandidates();
        assertFalse(SupportIceCandidates.ready(c.merge(BASE), true, true));
        c.add(0, RELAY);
        assertTrue(SupportIceCandidates.ready(c.merge(BASE), false, true));
    }
    @Test public void hostDoesNotReplaceRequiredRelay() {
        SupportIceCandidates c = new SupportIceCandidates();
        c.add(0, HOST);
        assertFalse(SupportIceCandidates.ready(c.merge(BASE), true, true));
        assertTrue(SupportIceCandidates.ready(c.merge(BASE), true, false));
        assertFalse(SupportIceCandidates.ready(c.merge(BASE), false, false));
    }
    @Test public void callbackCandidateSurvivesStaleLocalDescription() {
        SupportIceCandidates c = new SupportIceCandidates();
        c.add(0, RELAY);
        String merged = c.merge(BASE + "a=end-of-candidates\r\n");
        assertTrue(merged.contains("a=" + RELAY + "\r\n"));
        assertTrue(merged.contains("a=ice-ufrag:test\r\n"));
        assertFalse(merged.contains("a=end-of-candidates"));
    }
    @Test public void duplicatesAndForeignOrInjectedCandidatesAreIgnored() {
        SupportIceCandidates c = new SupportIceCandidates();
        c.add(0, RELAY); c.add(0, RELAY);
        c.add(1, HOST); c.add(0, HOST + "\r\nm=audio 9"); c.add(0, null);
        String merged = c.merge(BASE + "a=" + RELAY + "\r\n");
        assertEquals(1, merged.split("a=candidate:", -1).length - 1);
        assertFalse(merged.contains("typ host"));
    }
    @Test(expected=IllegalArgumentException.class)
    public void neverMergesIntoAnotherMediaSection() {
        new SupportIceCandidates().merge(BASE + "m=audio 9 UDP/TLS/RTP/SAVPF 96\r\n");
    }
}
