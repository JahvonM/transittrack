package com.transittrack.kioskhelper;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent i) {
        Status.log("Start-up signal: " + i.getAction());
        HelperService.start(c);
    }
}
