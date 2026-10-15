package com.transittrack.app;
import org.junit.Test;
import static org.junit.Assert.*;
public class TabletControlPolicyTest {
    private final String id = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    @Test public void fixedBoundedProofOnly() {
        assertTrue(TabletControlPolicy.proof(id, id, "lock_test", 120000, 600000));
        assertTrue(TabletControlPolicy.proof(id, id, "release", 1, 0));
        assertFalse(TabletControlPolicy.proof(id, id, "shell", 100, 0));
        assertFalse(TabletControlPolicy.proof(id, id, "reboot", 0, 0));
        assertFalse(TabletControlPolicy.proof(id, id, "reboot", 120001, 0));
        assertFalse(TabletControlPolicy.proof(id, id, "lock_test", 100, 600001));
        assertFalse(TabletControlPolicy.proof(id, id, "lock_test", 100, 0));
        assertFalse(TabletControlPolicy.proof(id, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "reboot", 100, 0));
    }
    @Test public void currentSafetyAndThreeMinuteQuietPeriodRequired() {
        assertTrue(TabletControlPolicy.rebootSafe(true, 200000, 1000, 201000));
        assertFalse(TabletControlPolicy.rebootSafe(false, 200000, 1000, 201000));
        assertFalse(TabletControlPolicy.rebootSafe(true, 180000, 1000, 201000));
        assertFalse(TabletControlPolicy.rebootSafe(true, 200000, 100000, 201000));
        assertFalse(TabletControlPolicy.rebootSafe(true, 202000, 1000, 201000));
        assertFalse(TabletControlPolicy.rebootSafe(true, 0, 0, 201000));
    }
    @Test public void rejectsMalformedKeyAndId() {
        assertTrue(TabletControlPolicy.id(id));
        assertFalse(TabletControlPolicy.id(null));
        assertFalse(TabletControlPolicy.id("bad"));
        assertFalse(TabletControlPolicy.token(id));
        assertTrue(TabletControlPolicy.token(id + id));
    }
}
