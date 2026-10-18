package com.transittrack.app;

import org.junit.Test;
import static org.junit.Assert.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

public class BoardingBleProtocolTest {
    private byte[] bytes(String s) { return s.getBytes(StandardCharsets.US_ASCII); }
    @Test public void validatesPrefixSizeAndPrintableAscii() {
        assertEquals("tt-code:ABC", BoardingBleProtocol.code(bytes("tt-code:ABC")));
        for (String s : new String[]{"tt-code:", "bad:ABC", "tt-code:A B", "tt-code:A\n", "tt-code:é"})
            assertNull(BoardingBleProtocol.code(s.getBytes(StandardCharsets.UTF_8)));
        assertNull(BoardingBleProtocol.code(new byte[201]));
        assertNull(BoardingBleProtocol.code(null));
    }
    @Test public void longWriteIsContiguousAndSingleUse() {
        BoardingBleProtocol p = new BoardingBleProtocol();
        assertTrue(p.append("phone", 0, bytes("tt-code:"), 100));
        assertTrue(p.append("phone", 8, bytes("PASS"), 101));
        assertEquals("tt-code:PASS", BoardingBleProtocol.code(p.execute("phone", true, 102)));
        assertNull(p.execute("phone", true, 103));
    }
    @Test public void invalidChunkDiscardsPartialWrite() {
        BoardingBleProtocol p = new BoardingBleProtocol();
        assertTrue(p.append("phone", 0, bytes("tt-code:"), 0));
        assertFalse(p.append("phone", 7, bytes("BAD"), 1));
        assertNull(p.execute("phone", true, 2));
        assertFalse(p.append("phone", 0, new byte[201], 3));
    }
    @Test public void cancelDisconnectExpiryAndStopDiscardPendingData() {
        BoardingBleProtocol p = new BoardingBleProtocol();
        assertTrue(p.append("p", 0, bytes("tt-code:PASS"), 0));
        assertNull(p.execute("p", false, 1));
        p.append("p", 0, bytes("tt-code:PASS"), 0); p.disconnect("p");
        assertNull(p.execute("p", true, 1));
        p.append("p", 0, bytes("tt-code:PASS"), 0);
        assertNull(p.execute("p", true, 10000));
        p.append("p", 0, bytes("tt-code:PASS"), 0); p.clearPending();
        assertNull(p.execute("p", true, 1));
    }
    @Test public void capsSimultaneousPartialWrites() {
        BoardingBleProtocol p = new BoardingBleProtocol();
        for (int i = 0; i < 8; i++) assertTrue(p.append("p" + i, 0, bytes("tt"), 0));
        assertFalse(p.append("overflow", 0, bytes("tt"), 0));
        assertTrue(p.append("new", 0, bytes("tt"), 10000));
    }
    @Test public void budgetsPhoneGapAndSlidingMinute() {
        BoardingBleProtocol p = new BoardingBleProtocol();
        assertTrue(p.reserve("a", 0)); assertFalse(p.reserve("a", 2999));
        assertTrue(p.reserve("a", 3000));
        for (int i = 0; i < 18; i++) assertTrue(p.reserve("p" + i, 4000));
        assertFalse(p.reserve("extra", 59000));
        assertTrue(p.reserve("extra", 60000));
    }
    @Test public void concurrentRequestsCannotExceedTwenty() throws Exception {
        BoardingBleProtocol p = new BoardingBleProtocol();
        ExecutorService pool = Executors.newFixedThreadPool(12);
        AtomicInteger accepted = new AtomicInteger();
        CountDownLatch done = new CountDownLatch(100);
        for (int i = 0; i < 100; i++) {
            final String phone = "p" + i;
            pool.execute(() -> { try { if (p.reserve(phone, 5000)) accepted.incrementAndGet(); } finally { done.countDown(); } });
        }
        assertTrue(done.await(5, TimeUnit.SECONDS)); pool.shutdownNow();
        assertEquals(20, accepted.get());
    }
    @Test public void clipsBusNameToAdvertisementBudget() {
        assertEquals("TransitTrack bus", BoardingBleProtocol.name("💥"));
        assertEquals(24, BoardingBleProtocol.name("A very long bus name beyond the limit").length());
        assertEquals("Bus 12", BoardingBleProtocol.name("Bus 12"));
    }
}
