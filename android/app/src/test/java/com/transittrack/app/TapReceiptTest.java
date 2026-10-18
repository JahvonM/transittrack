package com.transittrack.app;
import org.junit.Test;
import static org.junit.Assert.*;

public class TapReceiptTest {
    @Test public void acceptsOnlyTheCurrentTap() {
        TapReceipt r = new TapReceipt();
        long now = System.currentTimeMillis();
        r.begin("first", now);
        r.begin("second", now);
        assertFalse(r.acknowledge("first", true, now));
        assertTrue(r.acknowledge("second", false, now));
        assertEquals(Boolean.FALSE, r.await("second", now + 10));
    }
    @Test public void acknowledgementIsIdempotentButCannotChangeItsResult() {
        TapReceipt r = new TapReceipt();
        long now = System.currentTimeMillis();
        r.begin("tap", now);
        assertTrue(r.acknowledge("tap", true, now));
        assertTrue(r.acknowledge("tap", true, now));
        assertFalse(r.acknowledge("tap", false, now));
        assertEquals(Boolean.TRUE, r.await("tap", now + 10));
    }
    @Test public void rejectsLateAndUnknownResults() {
        TapReceipt r = new TapReceipt();
        r.begin("tap", 1000);
        assertFalse(r.acknowledge("tap", true, 31000));
        assertFalse(r.acknowledge("other", true, 2000));
        assertNull(r.await("tap", 31000));
    }
    @Test public void stoppingClearsThePendingTap() {
        TapReceipt r = new TapReceipt();
        long now = System.currentTimeMillis();
        r.begin("tap", now); r.cancel();
        assertFalse(r.acknowledge("tap", true, now));
        assertNull(r.await("tap", now + 10000));
    }
    @Test public void timeoutNeverMeansSuccess() {
        TapReceipt r = new TapReceipt();
        long now = System.currentTimeMillis();
        r.begin("tap", now);
        assertNull(r.await("tap", now));
    }
}
