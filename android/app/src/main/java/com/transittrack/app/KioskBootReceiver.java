package com.transittrack.app;
import android.content.*;
/** Boot after user unlock, and same-package updates. Never accesses private data before unlock. */
public class KioskBootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent intent) {
        if (intent == null || !(Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction()) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction()))) return;
        KioskMode.reconcile(c);
        if (!KioskMode.enabled(c) || !KioskMode.owner(c)) return;
        try { if (!KioskMode.maintenance(c)) { KioskMode.configure(c); KioskWatchdogService.launch(c); } KioskWatchdogService.start(c); }
        catch (RuntimeException e) { KioskMode.prefs(c).edit().putString("last_error", "BOOT_REOPEN_FAILED").apply(); }
    }
}
