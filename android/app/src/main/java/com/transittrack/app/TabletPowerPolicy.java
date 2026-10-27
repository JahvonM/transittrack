package com.transittrack.app;

/** GPS parks at 5% on battery, resumes on power or at 8%; unknown data is not an empty battery.
 *  A driver's own phone (the store app) on battery takes a fix every 10 s instead of 5 s. */
final class TabletPowerPolicy {
    private boolean parked;
    private Boolean charging;
    synchronized boolean update(int percent, Boolean charging) {
        if (charging != null) this.charging = charging;
        if (Boolean.TRUE.equals(charging)) parked = false;
        else if (percent >= 8 && percent <= 100) parked = false;
        else if (Boolean.FALSE.equals(charging) && percent >= 0 && percent <= 5) parked = true;
        return parked;
    }
    synchronized boolean parked() { return parked; }
    /** Bus tablets, and phones on power or with an unknown battery, keep 5 s. */
    synchronized long gpsIntervalMs(boolean kiosk) {
        return kiosk || !Boolean.FALSE.equals(charging) ? 5000L : 10000L;
    }
}
