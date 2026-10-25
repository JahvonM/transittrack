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
        context.getSharedPreferences("transittrack_network",Context.MODE_PRIVATE).edit().clear().commit();
        BusHotspot.prefs(context).edit().clear().commit(); }
    private View find(View v,String text) {
        if(v instanceof TextView && text.equals(((TextView)v).getText().toString()))return v;
        if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++){View found=find(((ViewGroup)v).getChildAt(i),text);if(found!=null)return found;}
        return null;
    }
    private boolean shows(Activity a,String text){return find(a.getWindow().getDecorView(),text)!=null;}
    private TextView textStarting(View v,String start) {
        if(v instanceof TextView && ((TextView)v).getText().toString().startsWith(start))return (TextView)v;
        if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++){TextView found=textStarting(((ViewGroup)v).getChildAt(i),start);if(found!=null)return found;}
        return null;
    }
    private void press(Activity a,String label){View b=find(a.getWindow().getDecorView(),label);assertNotNull("missing "+label,b);b.performClick();}
    private void type(Activity a,String digits){for(char d:digits.toCharArray())press(a,String.valueOf(d));}
    private KioskMaintenanceActivity open(){return Robolectric.buildActivity(KioskMaintenanceActivity.class).setup().get();}
    private void await(Activity a,String text) throws Exception {
        for(int i=0;i<400;i++){Shadows.shadowOf(Looper.getMainLooper()).idle();if(shows(a,text))return;Thread.sleep(10);}
        fail("never showed "+text);
    }

    @Test public void firstSetupIsOnTheDeviceWithoutRemoteEnrollment() {
        KioskMaintenanceActivity a=open();
        assertTrue(shows(a,"Choose an exit code"));
        assertTrue(shows(a,"Next"));
        assertFalse(shows(a,"Start kiosk mode"));
    }
    @Test public void theCodeIsTypedOnAPadAndNeedsEightDigits() {
        KioskMaintenanceActivity a=open();
        Button next=(Button)find(a.getWindow().getDecorView(),"Next");
        type(a,"1234567");assertFalse(next.isEnabled());
        type(a,"8");assertTrue(next.isEnabled());
        press(a,"Delete");assertFalse(next.isEnabled());
    }
    @Test public void setupNeedsTheSameCodeTwice() throws Exception {
        KioskMaintenanceActivity a=open();
        type(a,"92746183");press(a,"Next");
        assertTrue(shows(a,"Enter the code again"));
        type(a,"11112222");press(a,"Save exit code");
        assertTrue(shows(a,"Choose an exit code"));
        assertTrue(shows(a,"The two codes didn't match. Choose the code again."));
        assertFalse(KioskRecoveryPin.configured(a));
        type(a,"92746183");press(a,"Next");type(a,"92746183");press(a,"Save exit code");
        await(a,"Start kiosk mode");
        assertTrue(KioskRecoveryPin.configured(a));
    }
    @Test public void savedCodeProtectsSettingsEvenWhenKioskModeIsOff() throws Exception {
        KioskRecoveryPin.set(context,"92746183");KioskMaintenanceActivity a=open();
        assertTrue(shows(a,"Enter the exit code"));
        assertFalse(shows(a,"Start kiosk mode"));
        assertFalse(shows(a,"Android settings"));
        assertFalse(shows(a,"Save exit code"));
    }
    @Test public void wrongCodeSaysHowManyTriesAreLeft() throws Exception {
        KioskRecoveryPin.set(context,"92746183");KioskMaintenanceActivity a=open();
        type(a,"00000000");press(a,"Open settings");
        for(int i=0;i<400 && textStarting(a.getWindow().getDecorView(),"Wrong code.")==null;i++){Shadows.shadowOf(Looper.getMainLooper()).idle();Thread.sleep(10);}
        assertEquals("Wrong code. 4 more tries, then a wait.",textStarting(a.getWindow().getDecorView(),"Wrong code.").getText().toString());
        assertFalse(shows(a,"Start kiosk mode"));
    }
    @Test public void correctCodeOpensLocalControlsWithoutAWebSession() throws Exception {
        KioskRecoveryPin.set(context,"92746183");KioskMaintenanceActivity a=open();
        type(a,"92746183");press(a,"Open settings");await(a,"Start kiosk mode");
        assertTrue(shows(a,"Kiosk settings"));
        assertTrue(shows(a,"Not set up")); // device owner
        // No device-owner permission: a local user cannot manufacture ownership.
        press(a,"Start kiosk mode");assertFalse(KioskMode.enabled(a));
        assertTrue(shows(a,"This app isn't the device owner yet. Set it up from Admin → Kiosk tablets → Set up a device."));
        press(a,"Exit code");assertTrue(shows(a,"Change exit code"));
        press(a,"Advanced");assertTrue(shows(a,"Android settings"));
        assertFalse(shows(a,"Remove device owner")); // only offered to the owner
    }
    @Test public void boardingDevicesSaveTheBusHotspotHere() throws Exception {
        context.getSharedPreferences("transittrack_network",Context.MODE_PRIVATE).edit().putString("mode","boarding").commit();
        KioskRecoveryPin.set(context,"92746183");KioskMaintenanceActivity a=open();
        type(a,"92746183");press(a,"Open settings");await(a,"Start kiosk mode");
        assertTrue(shows(a,"Bus hotspot"));
        press(a,"Network");
        assertTrue(shows(a,"Always join this hotspot"));
        assertTrue(shows(a,"Save hotspot"));
        assertFalse(shows(a,"Turn on the hotspot by itself"));
    }
    @Test public void driverTabletsShowTheirOwnHotspot() throws Exception {
        context.getSharedPreferences("transittrack_network",Context.MODE_PRIVATE).edit().putString("mode","driver").commit();
        KioskRecoveryPin.set(context,"92746183");KioskMaintenanceActivity a=open();
        type(a,"92746183");press(a,"Open settings");await(a,"Start kiosk mode");
        press(a,"Network");
        assertTrue(shows(a,"Turn on the hotspot by itself"));
        assertFalse(shows(a,"Save hotspot"));
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
