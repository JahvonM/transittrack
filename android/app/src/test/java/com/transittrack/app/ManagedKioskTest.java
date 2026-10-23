package com.transittrack.app;

import android.content.Context;
import android.os.SystemClock;
import android.provider.Settings;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowSystemClock;
import java.time.Duration;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28, manifest=Config.NONE)
public class ManagedKioskTest {
    private Context context;
    @Before public void reset() {
        context = RuntimeEnvironment.getApplication(); KioskMode.prefs(context).edit().clear().commit();
        Settings.Global.putInt(context.getContentResolver(), Settings.Global.BOOT_COUNT, 3);
    }
    @Test public void installationDoesNotEnableKioskOrMaintenance() {
        assertFalse(KioskMode.enabled(context)); assertFalse(KioskMode.maintenance(context)); assertFalse(KioskRecoveryPin.configured(context));
    }
    @Test public void noOwnerMeansNoPermanentPolicy() { assertEquals("DEVICE_OWNER_REQUIRED", KioskMode.disable(context)); }
    @Test public void maintenanceExpiresAndDoesNotSurviveReboot() {
        KioskMode.prefs(context).edit().putBoolean("enabled", true).commit();
        assertTrue(KioskMode.saveWindow(context, "maintenance", 600000)); assertTrue(KioskMode.maintenance(context));
        ShadowSystemClock.advanceBy(Duration.ofMillis(600001)); assertFalse(KioskMode.maintenance(context));
        KioskMode.saveWindow(context, "maintenance", 600000); assertTrue(KioskMode.maintenance(context));
        Settings.Global.putInt(context.getContentResolver(), Settings.Global.BOOT_COUNT, 4); assertFalse(KioskMode.maintenance(context));
    }
    @Test public void enrollmentHasNoAuthorityAfterDeadlineOrReboot() {
        assertTrue(KioskMode.saveWindow(context, "enrollment", 120000)); assertTrue(KioskMode.window(context, "enrollment"));
        ShadowSystemClock.advanceBy(Duration.ofMillis(120001)); assertFalse(KioskMode.window(context, "enrollment"));
        KioskMode.saveWindow(context, "enrollment", 120000); Settings.Global.putInt(context.getContentResolver(), Settings.Global.BOOT_COUNT, 4);
        assertFalse(KioskMode.window(context, "enrollment"));
    }
    @Test public void pinIsSaltedHashedAndNeverStoredAsPlaintext() throws Exception {
        assertFalse(KioskRecoveryPin.set(context, "1234")); assertTrue(KioskRecoveryPin.set(context, "92746183"));
        assertTrue(KioskRecoveryPin.configured(context));
        String first = KioskMode.prefs(context).getString("pin_hash", "");
        assertFalse(KioskMode.prefs(context).getAll().toString().contains("92746183"));
        assertTrue(KioskRecoveryPin.verify(context, "92746183")); assertFalse(KioskRecoveryPin.verify(context, "11111111"));
        KioskRecoveryPin.set(context, "92746183"); assertNotEquals(first, KioskMode.prefs(context).getString("pin_hash", ""));
    }
    @Test public void repeatedFailuresAreThrottledAcrossReboot() throws Exception {
        KioskRecoveryPin.set(context, "92746183");
        for(int n=0;n<5;n++) assertFalse(KioskRecoveryPin.verify(context, "00000000"));
        assertTrue(KioskRecoveryPin.remaining(context) > 0); assertFalse(KioskRecoveryPin.verify(context, "92746183"));
        Settings.Global.putInt(context.getContentResolver(), Settings.Global.BOOT_COUNT, 4);
        assertTrue(KioskRecoveryPin.remaining(context) > 0);
        ShadowSystemClock.advanceBy(Duration.ofMillis(30001));
        // Wall-clock and monotonic limits must both expire (Robolectric advances both).
        KioskMode.prefs(context).edit().putLong("pin_until_wall", System.currentTimeMillis()-1).commit();
        assertTrue(KioskRecoveryPin.verify(context, "92746183"));
    }
    @Test public void fixedCommandsNeverAuthorizeArbitraryActions() {
        String id="aabbccddeeff00112233445566778899";
        for(String action:new String[]{"kiosk_prepare","kiosk_enable","kiosk_disable","kiosk_maintenance"}) {
            assertTrue(TabletControlPolicy.proof(id,id,action,120000,0));
            assertFalse(TabletControlPolicy.proof(id,id,action,120001,0));
        }
        assertFalse(TabletControlPolicy.action("kiosk_shell"));
    }
}
