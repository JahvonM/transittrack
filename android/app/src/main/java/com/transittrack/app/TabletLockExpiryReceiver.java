package com.transittrack.app;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
/** Non-exported alarm/boot receiver can only release a persisted test lease. */
public class TabletLockExpiryReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) TabletLockRecovery.release(context);
        else if ("com.transittrack.app.LOCK_EXPIRED".equals(intent.getAction()) && TabletLockRecovery.due(context)) TabletLockRecovery.release(context);
    }
}
