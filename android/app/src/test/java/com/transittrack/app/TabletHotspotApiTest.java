package com.transittrack.app;

import android.content.Context;
import android.os.*;
import java.lang.reflect.*;
import com.transittrack.fixture.TetheringFixture;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28,manifest=Config.NONE)
public class TabletHotspotApiTest {
    private Context context;
    @Before public void reset(){context=RuntimeEnvironment.getApplication();TabletHotspotStartupService.prefs(context).edit().clear().commit();}
    @Test public void resolvesConnectivityBinderWithoutPrivateManagerFields() throws Exception {
        Binder binder=new Binder();
        org.robolectric.shadows.ShadowServiceManager.addService(Context.CONNECTIVITY_SERVICE,binder);
        Object service=TabletHotspotApi.connectivityService();
        assertNotNull(service);
        assertTrue(Class.forName("android.net.IConnectivityManager").isInstance(service));
        assertSame(binder,((IInterface)service).asBinder());
    }
    @Test public void startsThroughPublicContractWhenConcreteProxyIsPrivate() throws Exception {
        Object proxy=TetheringFixture.proxy();
        Method old=proxy.getClass().getMethod("startTethering",int.class,ResultReceiver.class,boolean.class,String.class);
        try { old.invoke(proxy,0,null,false,"test");fail("Private proxy should reject direct reflective invocation"); }
        catch(IllegalAccessException expected) { }
        final boolean[] completed={false};
        assertTrue(TabletHotspotApi.requestOnInterface(context,true,ok->completed[0]=ok,proxy,TetheringFixture.Contract.class));
        assertEquals(0,TetheringFixture.type(proxy));assertEquals(context.getPackageName(),TetheringFixture.caller(proxy));
        assertFalse(TetheringFixture.provisioning(proxy));assertFalse(completed[0]);
        TetheringFixture.complete(proxy,0);Shadows.shadowOf(Looper.getMainLooper()).idle();assertTrue(completed[0]);
    }
    @Test public void platformFailureRetainsNumericResultAndDoesNotClaimSuccess() throws Exception {
        Object proxy=TetheringFixture.proxy();final boolean[] completed={true};
        TabletHotspotApi.requestOnInterface(context,true,ok->completed[0]=ok,proxy,TetheringFixture.Contract.class);
        TetheringFixture.complete(proxy,11);Shadows.shadowOf(Looper.getMainLooper()).idle();
        assertFalse(completed[0]);assertEquals("HOTSPOT_ANDROID_RESULT_11",TabletHotspotApi.failureCode(context));
    }
    @Test public void stopsThroughTheSamePublicContract() throws Exception {
        Object proxy=TetheringFixture.proxy();
        assertTrue(TabletHotspotApi.requestOnInterface(context,false,ok->{},proxy,TetheringFixture.Contract.class));
        assertEquals(0,TetheringFixture.type(proxy));assertEquals(context.getPackageName(),TetheringFixture.caller(proxy));
    }
    @Test public void missingPlatformMethodIsReportedSeparately() throws Exception {
        assertFalse(TabletHotspotApi.requestOnInterface(context,true,ok->{},new Object(),Object.class));
        assertEquals("HOTSPOT_API_UNAVAILABLE",TabletHotspotApi.failureCode(context));
    }
    @Test public void permissionAccessAndPlatformFailuresRemainDistinct() {
        assertEquals("HOTSPOT_ANDROID_PERMISSION_DENIED",TabletHotspotApi.classify(new InvocationTargetException(new SecurityException("private details"))));
        assertEquals("HOTSPOT_API_ACCESS_BLOCKED",TabletHotspotApi.classify(new IllegalAccessException()));
        assertEquals("HOTSPOT_API_ACCESS_BLOCKED",TabletHotspotApi.classify(new NoSuchFieldException()));
        assertEquals("HOTSPOT_API_UNAVAILABLE",TabletHotspotApi.classify(new ClassNotFoundException()));
        assertEquals("HOTSPOT_ANDROID_CALL_FAILED",TabletHotspotApi.classify(new InvocationTargetException(new IllegalStateException())));
    }
}
