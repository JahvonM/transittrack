package com.transittrack.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private TabletScreenRecovery screenRecovery;
    private long cornerStarted;
    private int cornerTaps;
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // These are appended after auto-discovered plugins by BridgeActivity.load().
        // The guarded push plugin must replace the stock plugin before JS starts.
        initialPlugins.add(TabletSupportPlugin.class);
        initialPlugins.add(UsbGpsPlugin.class);
        initialPlugins.add(DriverBackgroundPlugin.class);
        initialPlugins.add(UsbNfcPlugin.class);
        initialPlugins.add(BoardingBluetoothPlugin.class);
        initialPlugins.add(TabletHealthPlugin.class);
        initialPlugins.add(TabletRecoveryPlugin.class);
        initialPlugins.add(TabletNetworkPlugin.class);
        initialPlugins.add(TabletControlPlugin.class);
        initialPlugins.add(SafePushNotificationsPlugin.class);
        super.onCreate(savedInstanceState);
        KioskMode.reconcile(this);
        getOnBackPressedDispatcher().addCallback(this, new androidx.activity.OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (KioskMode.enabled(MainActivity.this) && !KioskMode.maintenance(MainActivity.this)) return;
                setEnabled(false);
                try { getOnBackPressedDispatcher().onBackPressed(); } finally { setEnabled(true); }
            }
        });
        keepTabletAwake();
        // Like FreeKiosk: no visible settings button. Tapping the top-right
        // corner 5 times quickly opens kiosk settings (behind the exit code).
        // The invisible tap area covers the corner the old gear button used.
        android.view.View corner = new android.view.View(this);
        corner.setContentDescription("Kiosk settings. Tap 5 times, then enter the exit code.");
        corner.setOnClickListener(v -> {
            long now = android.os.SystemClock.elapsedRealtime();
            if (now - cornerStarted > 3000) { cornerStarted = now; cornerTaps = 0; }
            if (++cornerTaps >= 5) {
                cornerTaps = 0; cornerStarted = 0;
                startActivity(new android.content.Intent(this, KioskMaintenanceActivity.class));
            }
        });
        int size = (int) (64 * getResources().getDisplayMetrics().density);
        addContentView(corner, new android.widget.FrameLayout.LayoutParams(size, size, android.view.Gravity.TOP | android.view.Gravity.RIGHT));
        getWindow().getDecorView().setOnSystemUiVisibilityChangeListener(visibility -> {
            if ((visibility & android.view.View.SYSTEM_UI_FLAG_HIDE_NAVIGATION)==0)
                getWindow().getDecorView().postDelayed(() -> KioskMode.immersive(this),300);
        });
        screenRecovery = new TabletScreenRecovery(this);
        if (getBridge() != null) getBridge().addWebViewListener(screenRecovery);
    }
    @Override public void onUserInteraction() {
        super.onUserInteraction();
        noteTabletInteraction();
    }
    void noteTabletInteraction() {
        if (getBridge() != null && getBridge().getPlugin("TabletControl") != null) {
            ((TabletControlPlugin) getBridge().getPlugin("TabletControl").getInstance()).noteInteraction();
        }
    }
    private void keepTabletAwake() {
        TabletDisplay.apply(this);
    }
    @Override public void onResume() {
        super.onResume(); keepTabletAwake();
        KioskWatchdogService.lastVisible = android.os.SystemClock.elapsedRealtime();
        KioskMode.resume(this);
        TabletHotspotStartupService.start(this);
        final android.content.Context app = getApplicationContext();
        new Thread(() -> BusHotspot.ensure(app), "bus-hotspot").start();
        DriverLocationService.setVisible(true);
        if (screenRecovery != null) screenRecovery.resumed();
    }
    @Override public void onPause() {
        DriverLocationService.setVisible(false);
        if (screenRecovery != null) screenRecovery.paused();
        super.onPause();
    }
    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) { keepTabletAwake(); KioskMode.resume(this); }
    }
}
