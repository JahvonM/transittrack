package com.transittrack.app;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // These are appended after auto-discovered plugins by BridgeActivity.load().
        // The guarded push plugin must replace the stock plugin before JS starts.
        initialPlugins.add(TabletSupportPlugin.class);
        initialPlugins.add(UsbGpsPlugin.class);
        initialPlugins.add(UsbNfcPlugin.class);
        initialPlugins.add(BoardingBluetoothPlugin.class);
        initialPlugins.add(TabletHealthPlugin.class);
        initialPlugins.add(TabletRecoveryPlugin.class);
        initialPlugins.add(TabletNetworkPlugin.class);
        initialPlugins.add(TabletControlPlugin.class);
        initialPlugins.add(SafePushNotificationsPlugin.class);
        super.onCreate(savedInstanceState);
        keepTabletAwake();
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
    @Override public void onResume() { super.onResume(); keepTabletAwake(); }
    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) keepTabletAwake();
    }
}
