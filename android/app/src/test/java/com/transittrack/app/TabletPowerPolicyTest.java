package com.transittrack.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class TabletPowerPolicyTest {
    @Test public void parksOnlyOnKnownLowBatteryWithoutPower() {
        TabletPowerPolicy p = new TabletPowerPolicy();
        assertFalse(p.update(-1, false));
        assertFalse(p.update(5, null));
        assertFalse(p.update(5, true));
        assertTrue(p.update(5, false));
        assertTrue(p.update(0, false));
    }
    @Test public void hasHysteresisAndRestoresOnCharge() {
        TabletPowerPolicy p = new TabletPowerPolicy();
        assertTrue(p.update(4, false));
        assertTrue(p.update(6, false));
        assertTrue(p.update(7, false));
        assertFalse(p.update(8, false));
        assertFalse(p.update(6, false));
        assertTrue(p.update(5, false));
        assertFalse(p.update(1, true));
    }
    @Test public void unknownReadingsDoNotChangeExistingParkState() {
        TabletPowerPolicy p = new TabletPowerPolicy();
        p.update(3, false);
        assertTrue(p.update(-1, null));
        assertTrue(p.update(101, false));
        assertTrue(p.update(-5, false));
        assertFalse(p.update(-1, true));
    }
}
