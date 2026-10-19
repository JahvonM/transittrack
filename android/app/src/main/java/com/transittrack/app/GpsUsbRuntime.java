package com.transittrack.app;
/** One serial reader executor across Activity and service lifetimes. */
final class GpsUsbRuntime {
    static final java.util.concurrent.ExecutorService worker = java.util.concurrent.Executors.newSingleThreadExecutor();
}
