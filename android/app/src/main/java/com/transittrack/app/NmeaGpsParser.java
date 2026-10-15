package com.transittrack.app;

/** NMEA GGA/RMC decoding, independent of Android so receiver samples can be tested. */
public final class NmeaGpsParser {
    private int satellites;
    private double hdop;
    private double altitude = Double.NaN;

    public int satellites() { return satellites; }

    public static final class Fix {
        public final double latitude, longitude, speed, heading, accuracy, altitude;
        public final int satellites;
        public final long timestamp;
        Fix(double lat, double lng, double speed, double heading, double accuracy,
                double altitude, int satellites, long timestamp) {
            this.latitude = lat; this.longitude = lng; this.speed = speed;
            this.heading = heading; this.accuracy = accuracy; this.altitude = altitude;
            this.satellites = satellites; this.timestamp = timestamp;
        }
    }

    public Fix accept(String sentence, long receivedAt) {
        if (sentence == null || sentence.length() < 10 || sentence.charAt(0) != '$') return null;
        int star = sentence.indexOf('*');
        if (star < 0 || star + 3 != sentence.length()) return null;
        try {
            int checksum = 0;
            for (int i = 1; i < star; i++) checksum ^= sentence.charAt(i);
            if (checksum != Integer.parseInt(sentence.substring(star + 1), 16)) return null;
            String[] f = sentence.substring(0, star).split(",", -1);
            if (!f[0].matches("\\$G[A-Z](GGA|RMC)")) return null;
            String type = f[0].substring(3);
            if ("GGA".equals(type) && f.length > 9) {
                int quality = Integer.parseInt(f[6]);
                satellites = f[7].isEmpty() ? 0 : Math.max(0, Math.min(99, Integer.parseInt(f[7])));
                hdop = quality > 0 && !f[8].isEmpty() ? Double.parseDouble(f[8]) : 0;
                altitude = quality > 0 && !f[9].isEmpty() ? Double.parseDouble(f[9]) : Double.NaN;
                return null;
            }
            if (!"RMC".equals(type) || f.length <= 8 || !"A".equals(f[2])) return null;
            double lat = coordinate(f[3], f[4], true);
            double lng = coordinate(f[5], f[6], false);
            double speed = f[7].isEmpty() ? Double.NaN : Double.parseDouble(f[7]) * 0.514444;
            double heading = f[8].isEmpty() ? Double.NaN : Double.parseDouble(f[8]);
            if (!Double.isFinite(lat) || !Double.isFinite(lng) ||
                (!Double.isNaN(speed) && (!Double.isFinite(speed) || speed < 0 || speed > 100)) ||
                (!Double.isNaN(heading) && (!Double.isFinite(heading) || heading < 0 || heading > 360))) return null;
            double accuracy = Double.isFinite(hdop) && hdop > 0 ? Math.max(3, hdop * 5) : 10;
            return new Fix(lat, lng, speed, heading, accuracy, altitude, satellites, receivedAt);
        } catch (RuntimeException invalid) { return null; }
    }

    private static double coordinate(String raw, String hemisphere, boolean latitude) {
        if (!(latitude ? ("N".equals(hemisphere) || "S".equals(hemisphere))
                      : ("E".equals(hemisphere) || "W".equals(hemisphere)))) return Double.NaN;
        double value = Double.parseDouble(raw);
        int degrees = (int) (value / 100);
        double minutes = value - degrees * 100;
        double result = degrees + minutes / 60;
        if (value < 0 || minutes < 0 || minutes >= 60 || result > (latitude ? 90 : 180)) return Double.NaN;
        return ("S".equals(hemisphere) || "W".equals(hemisphere)) ? -result : result;
    }
}
