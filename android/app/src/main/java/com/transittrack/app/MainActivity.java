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
        android.widget.Button settings = new android.widget.Button(this);
        settings.setText("⚙"); settings.setTextSize(22); settings.setTextColor(android.graphics.Color.WHITE);
        settings.setContentDescription("Kiosk settings · exit code required");
        android.graphics.drawable.GradientDrawable background = new android.graphics.drawable.GradientDrawable();
        background.setColor(android.graphics.Color.rgb(11,16,24)); background.setCornerRadius(48);
        background.setStroke(2,android.graphics.Color.rgb(208,241,92)); settings.setBackground(background);
        int size=(int)(48*getResources().getDisplayMetrics().density), margin=(int)(8*getResources().getDisplayMetrics().density);
        android.widget.FrameLayout.LayoutParams position=new android.widget.FrameLayout.LayoutParams(size,size,android.view.Gravity.TOP|android.view.Gravity.RIGHT);
        position.setMargins(margin,margin,margin,margin);
        settings.setOnClickListener(v -> startActivity(new android.content.Intent(this,KioskMaintenanceActivity.class)));
        addContentView(settings,position);
        getWindow().getDecorView().setOnSystemUiVisibilityChangeListener(visibility -> {
            if ((visibility & android.view.View.SYSTEM_UI_FLAG_HIDE_NAVIGATION)==0)
                getWindow().getDecorView().postDelayed(() -> KioskMode.immersive(this),300);
        });
        screenRecovery = new TabletScreenRecovery(this);
        if (getBridge() != null) getBridge().addWebViewListener(screenRecovery);
    }
    @Override public boolean dispatchTouchEvent(android.view.MotionEvent event) {
        if (KioskMode.enabled(this) && event.getActionMasked() == android.view.MotionEvent.ACTION_DOWN) {
            float corner = 48 * getResources().getDisplayMetrics().density;
            long now = android.os.SystemClock.elapsedRealtime();
            if (event.getX() >= getWindow().getDecorView().getWidth() - corner && event.getY() <= corner) {
                if (now - cornerStarted > 4000) { cornerStarted = now; cornerTaps = 0; }
                if (++cornerTaps >= 7) {
                    cornerTaps = 0; cornerStarted = now;
                    startActivity(new android.content.Intent(this, KioskMaintenanceActivity.class));
                }
            } else cornerTaps = 0;
        }
        return super.dispatchTouchEvent(event);
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
