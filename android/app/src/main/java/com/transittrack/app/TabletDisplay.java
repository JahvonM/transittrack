package com.transittrack.app;

import android.app.Activity;
import android.content.Context;
import android.view.WindowManager;

/** Per-tablet display preference; GPS and recording ownership are independent. */
final class TabletDisplay {
    static boolean enabled(Context context) {
        return context.getSharedPreferences("tablet_display", Context.MODE_PRIVATE).getBoolean("keep_screen_on", true);
    }
    static boolean save(Context context, boolean enabled) {
        return context.getSharedPreferences("tablet_display", Context.MODE_PRIVATE).edit().putBoolean("keep_screen_on", enabled).commit();
    }
    static void apply(Activity activity) {
        if (enabled(activity)) activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
