package com.transittrack.app;

final class DriverTrackingPolicy {
    static boolean leaseValid(long now, long verified, long expires) {
        return verified > 0 && now >= verified - 60000 && expires > now && expires > verified && expires - verified <= 20 * 3600000L;
    }
    static boolean sample(double lat,double lng,double accuracy,double speed,long time,long now) {
        return Double.isFinite(lat) && Math.abs(lat)<=90 && Double.isFinite(lng) && Math.abs(lng)<=180
            && Double.isFinite(accuracy) && accuracy>=0 && accuracy<=100 && Double.isFinite(speed) && speed>=0 && speed<=100
            && time>0 && time<=now+2000 && time>=now-10000;
    }
    static long retryDelay(int failures,long retrySeconds) {
        return Math.max(Math.min(300000L,15000L*(1L<<Math.min(Math.max(failures,0),5))),Math.min(Math.max(0,retrySeconds),3600)*1000);
    }
}
