package com.transittrack.app;

import android.app.Activity;
import android.content.Context;
import android.os.Looper;
import android.view.*;
import android.widget.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28,manifest=Config.NONE)
public class LocalKioskSettingsTest {
    private Context context;
    @Before public void reset() { context=RuntimeEnvironment.getApplication();KioskMode.prefs(context).edit().clear().commit();
        context.getSharedPreferences("transittrack_network",Context.MODE_PRIVATE).edit().clear().commit(); }
    private View find(View v,String text) {
        if(v instanceof TextView && text.equals(((TextView)v).getText().toString()))return v;
        if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++){View found=find(((ViewGroup)v).getChildAt(i),text);if(found!=null)return found;}
        return null;
    }
    private EditText input(View v) {
        if(v instanceof EditText)return (EditText)v;
        if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++){EditText found=input(((ViewGroup)v).getChildAt(i));if(found!=null)return found;}
        return null;
    }
    private KioskMaintenanceActivity open(){return Robolectric.buildActivity(KioskMaintenanceActivity.class).setup().get();}
    private void awaitMenu(Activity a) throws Exception {
        for(int i=0;i<150;i++){Shadows.shadowOf(Looper.getMainLooper()).idle();if(find(a.getWindow().getDecorView(),"Start kiosk mode")!=null)return;Thread.sleep(10);}
    }
    @Test public void firstSetupIsOnTabletWithoutRemoteEnrollment() {
        KioskMaintenanceActivity a=open();
        assertNotNull(find(a.getWindow().getDecorView(),"Set kiosk exit code"));
        assertNotNull(find(a.getWindow().getDecorView(),"Save exit code"));
        assertNull(find(a.getWindow().getDecorView(),"Start kiosk mode"));
    }
    @Test public void savedCodeProtectsSettingsEvenWhenKioskModeIsOff() throws Exception {
        KioskRecoveryPin.set(context,"92746183");KioskMaintenanceActivity a=open();
        assertNotNull(find(a.getWindow().getDecorView(),"Enter kiosk exit code"));
        assertNull(find(a.getWindow().getDecorView(),"Start kiosk mode"));
        assertNull(find(a.getWindow().getDecorView(),"Android settings"));
        assertNull(find(a.getWindow().getDecorView(),"Save exit code"));
    }
    @Test public void correctCodeOpensLocalControlsWithoutAWebSession() throws Exception {
        KioskRecoveryPin.set(context,"92746183");KioskMaintenanceActivity a=open();
        input(a.getWindow().getDecorView()).setText("92746183");find(a.getWindow().getDecorView(),"Unlock kiosk settings").performClick();awaitMenu(a);
        assertNotNull(find(a.getWindow().getDecorView(),"Start kiosk mode"));
        assertNotNull(find(a.getWindow().getDecorView(),"Change exit code"));
        // No device-owner permission: a local user cannot manufacture ownership.
        find(a.getWindow().getDecorView(),"Start kiosk mode").performClick();assertFalse(KioskMode.enabled(a));
    }
    @Test public void fullscreenIsAppliedBeforeAnyWebOrPairingData() {
        Activity a=Robolectric.buildActivity(Activity.class).setup().get();KioskMode.immersive(a);
        int flags=a.getWindow().getDecorView().getSystemUiVisibility();
        assertTrue((flags&View.SYSTEM_UI_FLAG_FULLSCREEN)!=0);assertTrue((flags&View.SYSTEM_UI_FLAG_HIDE_NAVIGATION)!=0);
    }
    @Test public void hotspotStartupRequiresSavedDriverOptIn() {
        android.content.SharedPreferences p=context.getSharedPreferences("transittrack_network",Context.MODE_PRIVATE);
        assertFalse(TabletHotspotStartupService.wanted(context));
        p.edit().putBoolean("enabled",true).putBoolean("always",true).putString("mode","driver").commit();
        assertTrue(TabletHotspotStartupService.wanted(context));
        p.edit().putString("mode","boarding").commit();assertFalse(TabletHotspotStartupService.wanted(context));
        p.edit().putString("mode","driver").putBoolean("always",false).commit();assertFalse(TabletHotspotStartupService.wanted(context));
    }
    @Test public void unsupportedAutomationIsNotReportedAsOn() {
        android.content.SharedPreferences p=context.getSharedPreferences("transittrack_network",Context.MODE_PRIVATE);
        p.edit().putBoolean("enabled",true).putBoolean("always",true).putString("mode","driver").commit();
        TabletHotspotStartupService.start(context);
        assertEquals("HOTSPOT_ANDROID_VERSION_UNSUPPORTED",p.getString("startup_code",""));
        assertTrue(p.getBoolean("always",false)); // Preserve the requested policy, separately from actual power.
    }
}
