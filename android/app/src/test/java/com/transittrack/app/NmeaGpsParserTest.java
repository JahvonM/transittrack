package com.transittrack.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class NmeaGpsParserTest {
    private String frame(String body) {
        int sum = 0;
        for (int i = 0; i < body.length(); i++) sum ^= body.charAt(i);
        return "$" + body + "*" + String.format("%02X", sum);
    }
    private String rmc(String lat, String ns, String lng, String ew, String speed, String heading) {
        return frame("GNRMC,120000.00,A," + lat + "," + ns + "," + lng + "," + ew + "," + speed + "," + heading + ",151026,,,A");
    }
    @Test public void decodesGrenadaFixAndUnits() {
        NmeaGpsParser parser = new NmeaGpsParser();
        parser.accept(frame("GNGGA,120000.00,1203.0000,N,06145.0000,W,1,09,0.8,25.4,M,0,M,,"), 100);
        NmeaGpsParser.Fix p = parser.accept(rmc("1203.0000","N","06145.0000","W","10","180"), 12345);
        assertNotNull(p);
        assertEquals(12.05, p.latitude, 0.000001);
        assertEquals(-61.75, p.longitude, 0.000001);
        assertEquals(5.14444, p.speed, 0.00001);
        assertEquals(180, p.heading, 0);
        assertEquals(4, p.accuracy, 0);
        assertEquals(25.4, p.altitude, 0);
        assertEquals(9, p.satellites);
        assertEquals(12345, p.timestamp);
    }
    @Test public void rejectsCorruptAndIncompleteFrames() {
        NmeaGpsParser parser = new NmeaGpsParser();
        assertNull(parser.accept("$GNRMC,120000,A*00", 100));
        assertNull(parser.accept("$GNRMC,120000,A", 100));
        assertNull(parser.accept(null, 100));
        assertNull(parser.accept(frame("GNRMC,120000,V,1203,N,06145,W,1,2,151026"), 100));
    }
    @Test public void validatesCoordinatesAndMotion() {
        NmeaGpsParser parser = new NmeaGpsParser();
        assertNull(parser.accept(rmc("1260","N","06145","W","10","0"), 100));
        assertNull(parser.accept(rmc("9100","N","06145","W","10","0"), 100));
        assertNull(parser.accept(rmc("1203","X","06145","W","10","0"), 100));
        assertNull(parser.accept(rmc("1203","N","18100","W","10","0"), 100));
        assertNull(parser.accept(rmc("1203","N","06145","W","-1","0"), 100));
        assertNull(parser.accept(rmc("1203","N","06145","W","10","361"), 100));
    }
    @Test public void supportsSouthernAndEasternHemisphereAndMissingMotion() {
        NmeaGpsParser.Fix p = new NmeaGpsParser().accept(rmc("1203","S","06145","E","",""), 100);
        assertNotNull(p);
        assertEquals(-12.05, p.latitude, 0.000001);
        assertEquals(61.75, p.longitude, 0.000001);
        assertTrue(Double.isNaN(p.speed));
        assertTrue(Double.isNaN(p.heading));
    }
}
