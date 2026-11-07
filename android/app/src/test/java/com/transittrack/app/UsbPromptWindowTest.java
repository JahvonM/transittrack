package com.transittrack.app;

import android.app.ActivityManager;
import android.content.Context;
import android.os.Looper;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;
import java.time.Duration;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28, manifest=Config.NONE)
public class UsbPromptWindowTest {
    private Context context;
    private String own;

    @Before public void reset() {
        context = RuntimeEnvironment.getApplication();
        own = context.getPackageName();
        context.getSharedPreferences("tt_usb_prompt_window", Context.MODE_PRIVATE).edit().clear().commit();
    }
    private void owner() { Shadows.shadowOf(KioskMode.policy(context)).setDeviceOwner(KioskMode.admin(context)); }
    private void locked(boolean on) {
        Shadows.shadowOf((ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE))
            .setLockTaskModeState(on ? ActivityManager.LOCK_TASK_MODE_LOCKED : ActivityManager.LOCK_TASK_MODE_NONE);
    }
    private void allow(String... names) { KioskMode.policy(context).setLockTaskPackages(KioskMode.admin(context), names); }
    private String[] allowed() { return KioskMode.policy(context).getLockTaskPackages(KioskMode.admin(context)); }

    @Test public void changesNothingUnlessThisAppOwnsALockedTablet() {
        locked(true);
        assertFalse(UsbPromptWindow.open(context));       // not the device owner
        owner(); allow(own); locked(false);
        assertFalse(UsbPromptWindow.open(context));       // owner, but not locked
        assertArrayEquals(new String[]{own}, allowed());
    }

    @Test public void aLockedKioskLetsAndroidsUsbPopupShowUntilItIsAnswered() {
        owner(); allow(own); locked(true);
        assertTrue(UsbPromptWindow.open(context));
        assertArrayEquals(new String[]{own, UsbPromptWindow.SYSTEM_UI}, allowed());
        UsbPromptWindow.close(context);                   // popup answered
        assertArrayEquals(new String[]{own}, allowed());
    }

    @Test public void closesByItselfWhenNobodyAnswers() {
        owner(); allow(own); locked(true);
        assertTrue(UsbPromptWindow.open(context));
        Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(UsbPromptWindow.WINDOW_MS - 1000));
        assertEquals(2, allowed().length);
        Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(2000));
        assertArrayEquals(new String[]{own}, allowed());
    }

    @Test public void neverRemovesASystemUiEntryItDidNotAdd() {
        owner(); allow(own, UsbPromptWindow.SYSTEM_UI); locked(true);
        assertTrue(UsbPromptWindow.open(context));
        UsbPromptWindow.close(context);
        assertArrayEquals(new String[]{own, UsbPromptWindow.SYSTEM_UI}, allowed());
    }

    @Test public void aWindowLeftOpenByARestartIsClosedWhenTheAppStarts() {
        owner(); allow(own); locked(true);
        assertTrue(UsbPromptWindow.open(context));
        // The app restarts before the popup is answered; the timer is gone with it.
        UsbPromptWindow.closeIfLeftOpen(context);
        assertArrayEquals(new String[]{own}, allowed());
        UsbPromptWindow.closeIfLeftOpen(context);         // nothing left to do
        assertArrayEquals(new String[]{own}, allowed());
    }
}
