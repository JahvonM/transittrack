package com.transittrack.app;

import android.app.Activity;
import android.content.pm.PackageManager;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.os.Bundle;
import android.os.Looper;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowNfcAdapter;
import org.robolectric.util.ReflectionHelpers;
import org.robolectric.util.ReflectionHelpers.ClassParameter;
import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=31, manifest=Config.NONE)
public class BuiltInNfcReaderTest {
    private Activity activity;
    private NfcAdapter adapter;
    private BuiltInNfcReader reader;
    private TapReceipt receipt;
    private volatile boolean ready;
    private volatile String lastId, delivery, lastUid;
    private final AtomicInteger taps = new AtomicInteger();
    private final CountDownLatch tapped = new CountDownLatch(1);
    private final CountDownLatch confirmed = new CountDownLatch(1);

    @Before public void setup() {
        activity = Robolectric.buildActivity(Activity.class).setup().get();
        shadowOf(activity.getPackageManager()).setSystemFeature(PackageManager.FEATURE_NFC, true);
        ShadowNfcAdapter.setNfcHardwareExists(true);
        adapter = NfcAdapter.getDefaultAdapter(activity);
        shadowOf(adapter).setEnabled(true);
        receipt = new TapReceipt(); ready = true;
        reader = new BuiltInNfcReader(activity, adapter, receipt, new UsbNfcReader.Listener() {
            @Override public boolean isReady() { return ready; }
            @Override public void onStatus(String value) { }
            @Override public void onTap(String uid, String id, long at) {
                lastUid = uid; lastId = id; taps.incrementAndGet(); tapped.countDown();
            }
            @Override public void onDelivery(String value) {
                delivery = value;
                if (value.startsWith("Card ")) confirmed.countDown();
            }
        });
    }
    @After public void cleanup() { reader.stop(); }
    private Tag card() {
        return ReflectionHelpers.callStaticMethod(Tag.class, "createMockTag",
            ClassParameter.from(byte[].class, new byte[]{0, (byte) 0x80, (byte) 0xff, 1}),
            ClassParameter.from(int[].class, new int[0]),
            ClassParameter.from(Bundle[].class, new Bundle[0]));
    }
    private void dispatch() {
        shadowOf(adapter).dispatchTagDiscovered(card());
        shadowOf(Looper.getMainLooper()).idle();
    }
    @Test public void preservesUidByteOrderAndLeadingZeros() {
        assertEquals("0080FF01", BuiltInNfcReader.uid(new byte[]{0, (byte) 0x80, (byte) 0xff, 1}));
        assertNull(BuiltInNfcReader.uid(null));
        assertNull(BuiltInNfcReader.uid(new byte[0]));
        assertNull(BuiltInNfcReader.uid(new byte[17]));
    }
    @Test public void forwardsOnlyOnePendingTapAndRequiresTheMatchingAcknowledgement() throws Exception {
        reader.start(); assertTrue(shadowOf(adapter).isInReaderMode());
        dispatch(); assertTrue(tapped.await(2, TimeUnit.SECONDS));
        assertEquals("0080FF01", lastUid);
        assertTrue(lastId.startsWith("native-"));
        dispatch(); assertEquals(1, taps.get());
        assertFalse(receipt.acknowledge("other", true, System.currentTimeMillis()));
        assertTrue(receipt.acknowledge(lastId, false, System.currentTimeMillis()));
        assertTrue(confirmed.await(2, TimeUnit.SECONDS));
        assertEquals("Card rejected by app", delivery);
    }
    @Test public void ignoresTagsOutsideBoardingAndStopsWithTheActivity() {
        reader.start(); ready = false; dispatch(); assertEquals(0, taps.get());
        reader.stop(); assertFalse(shadowOf(adapter).isInReaderMode());
        ready = true; reader.onTagDiscovered(card());
        shadowOf(Looper.getMainLooper()).idle(); assertEquals(0, taps.get());
    }
    @Test public void stopCancelsAnUnconfirmedTap() throws Exception {
        reader.start(); dispatch(); assertTrue(tapped.await(2, TimeUnit.SECONDS));
        reader.stop();
        assertFalse(receipt.acknowledge(lastId, true, System.currentTimeMillis()));
    }
}
