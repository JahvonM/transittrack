package com.transittrack.app;

/** GPS parks at 5% on battery, resumes on power or at 8%; unknown data is not an empty battery. */
final class TabletPowerPolicy {
    private boolean parked;
    synchronized boolean update(int percent, Boolean charging) {
        if (Boolean.TRUE.equals(charging)) parked = false;
        else if (percent >= 8 && percent <= 100) parked = false;
        else if (Boolean.FALSE.equals(charging) && percent >= 0 && percent <= 5) parked = true;
        return parked;
    }
    synchronized boolean parked() { return parked; }
}
