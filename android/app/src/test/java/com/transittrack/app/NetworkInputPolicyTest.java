package com.transittrack.app;
import org.junit.Test;
import static org.junit.Assert.*;

public class NetworkInputPolicyTest {
    @Test public void checksUtf8SsidBytesAndControls() {
        assertTrue(NetworkInputPolicy.ssid("Depot Wi-Fi"));
        assertTrue(NetworkInputPolicy.ssid("éééééééééééééééé"));
        assertFalse(NetworkInputPolicy.ssid("ééééééééééééééééé"));
        assertFalse(NetworkInputPolicy.ssid("bad\nname")); assertFalse(NetworkInputPolicy.ssid(" "));
    }
    @Test public void checksPasswordsWithoutStoringThem() {
        assertTrue(NetworkInputPolicy.password("")); assertTrue(NetworkInputPolicy.password("abcd1234"));
        assertFalse(NetworkInputPolicy.password("short")); assertFalse(NetworkInputPolicy.password("abcd1234\n"));
        assertFalse(NetworkInputPolicy.password("naïve-password")); assertFalse(NetworkInputPolicy.password(null));
    }
    @Test public void checksIdsAndConfigurationEscaping() {
        assertTrue(NetworkInputPolicy.id("cmd-12345678")); assertFalse(NetworkInputPolicy.id("cmd-12345678\n"));
        assertEquals("\"a\\\"b\\\\c\"", NetworkInputPolicy.quote("a\"b\\c"));
    }
    @Test public void rejectsUnsupportedSecurity() {
        assertEquals("open", NetworkInputPolicy.lock("[ESS]"));
        assertEquals("password", NetworkInputPolicy.lock("[WPA2-PSK-CCMP][ESS]"));
        assertEquals("unsupported", NetworkInputPolicy.lock("[WPA2-EAP-CCMP]"));
        assertEquals("unsupported", NetworkInputPolicy.lock("[SAE]"));
        assertEquals("unsupported", NetworkInputPolicy.lock("[WEP]"));
    }
}
