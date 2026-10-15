package com.transittrack.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // These are appended after auto-discovered plugins by BridgeActivity.load().
        // The guarded push plugin must replace the stock plugin before JS starts.
        initialPlugins.add(TabletSupportPlugin.class);
        initialPlugins.add(SafePushNotificationsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
