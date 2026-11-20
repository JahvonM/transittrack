package com.transittrack.app;

import android.content.Context;

/**
 * Whether the bus location keeps going while the driver screen is covered (the
 * rear camera screen, Android settings) or the screen is off.
 *
 * Bus tablets (the kiosk app): always. The tablet belongs to the bus, and its
 * GPS module must never be cut off by another screen, a recording or a switch.
 * Drivers' own phones (the store app): only when the driver turns it on.
 */
final class DriverBackgroundPolicy {
    static final String PREFS = "tt_driver_background";
    private DriverBackgroundPolicy() {}

    static boolean enabled(boolean busTablet, boolean turnedOn) { return busTablet || turnedOn; }
    static boolean canTurnOff(boolean busTablet) { return !busTablet; }
    /** The USB GPS module keeps reading while another screen covers the driver screen. */
    static boolean keepReadingWhenCovered(boolean busTablet) { return busTablet; }

    static boolean busTablet() { return BuildConfig.KIOSK; }
    static boolean enabled(Context context) {
        return enabled(busTablet(), context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("enabled", false));
    }
}
