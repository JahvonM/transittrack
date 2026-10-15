package com.transittrack.app;
import android.content.*;
import android.content.pm.PackageInstaller;
/** Explicit installer callback only; never opens a delayed confirmation activity. */
public class NativeUpdateReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        SharedPreferences p = NativeAppUpdate.prefs(context);
        if (!NativeAppUpdate.pending(context) || !intent.getAction().equals(context.getPackageName() + ".UPDATE_RESULT." + p.getString("nonce", "")) ||
            intent.getIntExtra(PackageInstaller.EXTRA_SESSION_ID, -2) != p.getInt("session", -1)) return;
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_SUCCESS) return; // success confirmed from installed package on next start/health
        String code = status == PackageInstaller.STATUS_PENDING_USER_ACTION ? "UPDATE_CONFIRMATION_REQUIRED" : "UPDATE_FAILED";
        NativeAppUpdate.abandon(context, p.getInt("session", -1));
        p.edit().putString("code", code).commit();
    }
}
