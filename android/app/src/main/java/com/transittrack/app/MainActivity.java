package com.transittrack.app;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private TabletScreenRecovery screenRecovery;
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
        keepTabletAwake();
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
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
    @Override public void onResume() {
        super.onResume(); keepTabletAwake();
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
        if (hasFocus) keepTabletAwake();
    }
}
