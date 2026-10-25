package com.transittrack.app;

import android.content.Context;
import android.net.wifi.WifiConfiguration;
import android.net.wifi.WifiManager;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

/** "Always join this hotspot" on boarding and sign-in devices. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk=28,manifest=Config.NONE)
public class BusHotspotTest {
    private Context context;
    private WifiManager wifi;
    @Before public void reset() {
        context=RuntimeEnvironment.getApplication();
        BusHotspot.prefs(context).edit().clear().commit();
        wifi=(WifiManager)context.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
    }

    @Test public void savesOnlyAValidNameAndPassword() {
        assertEquals("BAD_NAME",BusHotspot.save(context,"  ","busthree2026",true));
        assertEquals("BAD_PASSWORD",BusHotspot.save(context,"McSween-Bus3","short",true));
        assertEquals("SAVED",BusHotspot.save(context,"McSween-Bus3","busthree2026",true));
        assertEquals("McSween-Bus3",BusHotspot.ssid(context));
        assertTrue(BusHotspot.always(context));
        assertTrue(BusHotspot.hasPassword(context));
    }
    @Test public void aBlankPasswordKeepsTheSavedOneForTheSameHotspot() {
        BusHotspot.save(context,"McSween-Bus3","busthree2026",true);
        assertEquals("SAVED",BusHotspot.save(context,"McSween-Bus3","",true));
        assertEquals("busthree2026",BusHotspot.prefs(context).getString("password",""));
        // A different hotspot doesn't inherit it (open network).
        assertEquals("SAVED",BusHotspot.save(context,"McSween-Bus4","",true));
        assertEquals("",BusHotspot.prefs(context).getString("password",""));
    }
    @Test public void doesNothingUntilAlwaysJoinIsOn() {
        assertEquals("OFF",BusHotspot.ensure(context,true));
        BusHotspot.save(context,"McSween-Bus3","busthree2026",false);
        assertEquals("OFF",BusHotspot.ensure(context,true));
        assertEquals("Saved, but not joining by itself",BusHotspot.describe(context));
    }
    @Test public void turnsWifiOnAddsTheHotspotAndJoinsIt() {
        wifi.setWifiEnabled(false);
        BusHotspot.save(context,"McSween-Bus3","busthree2026",true);
        assertEquals("JOINING",BusHotspot.ensure(context,true));
        assertTrue(wifi.isWifiEnabled());
        boolean found=false;
        for(WifiConfiguration n:wifi.getConfiguredNetworks()) if("\"McSween-Bus3\"".equals(n.SSID)){found=true;assertEquals("\"busthree2026\"",n.preSharedKey);}
        assertTrue(found);
        // Asked again straight away: it waits instead of piling up joins.
        assertEquals("WAITING",BusHotspot.ensure(context));
        // The saved network is reused, not added twice.
        BusHotspot.ensure(context,true);
        int copies=0;for(WifiConfiguration n:wifi.getConfiguredNetworks()) if("\"McSween-Bus3\"".equals(n.SSID))copies++;
        assertEquals(1,copies);
    }
    @Test public void describesWhatItIsDoing() {
        assertEquals("No hotspot saved yet",BusHotspot.describe(context));
        BusHotspot.save(context,"McSween-Bus3","busthree2026",true);
        BusHotspot.prefs(context).edit().putString("last_code","NOT_IN_RANGE").commit();
        assertEquals("Looking for McSween-Bus3. Is the driver tablet's hotspot on?",BusHotspot.describe(context));
        BusHotspot.prefs(context).edit().putString("last_code","WIFI_OFF").commit();
        assertEquals("Wi-Fi is off. Turn it on in Android settings.",BusHotspot.describe(context));
    }
}
