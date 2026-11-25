package com.transittrack.app;

/** When the USB GPS module goes quiet (no signal, unplugged, or it gave up),
 * the tablet's own GPS fills in until the module has a position again. */
final class GpsBackupPolicy {
    /** Same wait as USB_BACKUP_AFTER_MS in src/lib/driverGps.js. */
    static final long BACKUP_AFTER_MS = 30000;

    /** True once the module has given no position for BACKUP_AFTER_MS, counted
     * from its last position, or from when the module was started if it has
     * not had one yet. Times are SystemClock.elapsedRealtime(). */
    static boolean useTablet(long now, long usbStartedAt, long lastUsbFixAt) {
        return now - Math.max(usbStartedAt, lastUsbFixAt) >= BACKUP_AFTER_MS;
    }
}
