package com.transittrack.kioskhelper;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattServer;
import android.bluetooth.BluetoothGattServerCallback;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.AdvertiseCallback;
import android.bluetooth.le.AdvertiseData;
import android.bluetooth.le.AdvertiseSettings;
import android.bluetooth.le.BluetoothLeAdvertiser;
import android.content.Context;
import android.os.ParcelUuid;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Boarding tablets (Helper 1.13): backup boarding over Bluetooth. The tablet
 * advertises a TransitTrack service under the bus's name, at low power so only
 * phones near the door see it. A passenger with the TransitTrack app open taps
 * "Board by Bluetooth", picks this bus, and the phone writes their boarding
 * code ("tt-code:...", the same as their boarding QR) to the CODE characteristic.
 * The code goes to the boarding page, which checks it with the server exactly
 * like a scanned QR and shows the passenger's name to confirm. No pairing.
 */
final class BleBoarding {
    static final UUID SERVICE = UUID.fromString("7a1c0d3e-5b6f-4c2a-9e41-2f7d8b6a1c01");
    static final UUID CODE = UUID.fromString("7a1c0d3e-5b6f-4c2a-9e41-2f7d8b6a1c02");
    private static final int MAX_CODE = 200;
    private static final long SAME_PHONE_GAP_MS = 3000;
    private static final int MAX_PER_MINUTE = 20;

    interface Sink { void code(String text); }

    static volatile String status = "Off";

    private final Context c;
    private final Sink sink;
    private BluetoothGattServer server;
    private BluetoothLeAdvertiser advertiser;
    private boolean advertising = false;
    private String advertisedName = "";
    private final Map<String, ByteArrayOutputStream> pending = new HashMap<>();
    private final Map<String, Long> lastFrom = new HashMap<>();
    private final long[] recent = new long[MAX_PER_MINUTE];
    private int recentAt = 0;

    BleBoarding(Context c, Sink sink) {
        this.c = c.getApplicationContext();
        this.sink = sink;
    }

    /** Starts (or keeps) advertising as name. Safe to call every minute; retries what failed. */
    synchronized void ensure(String name) {
        try {
            BluetoothManager bm = (BluetoothManager) c.getSystemService(Context.BLUETOOTH_SERVICE);
            BluetoothAdapter a = bm == null ? null : bm.getAdapter();
            if (a == null) { status = "No Bluetooth on this tablet"; return; }
            if (!a.isEnabled()) {
                stop();
                status = a.enable() ? "Switching Bluetooth on" : "Bluetooth is off";
                return;
            }
            if (!a.isMultipleAdvertisementSupported()) { status = "This tablet can't advertise over Bluetooth"; return; }
            String shortName = clip(name);
            if (advertising && shortName.equals(advertisedName)) return;
            stop();
            if (!shortName.isEmpty() && !shortName.equals(a.getName())) a.setName(shortName);
            server = bm.openGattServer(c, callback);
            if (server == null) { status = "Bluetooth server could not start"; return; }
            BluetoothGattService service = new BluetoothGattService(SERVICE, BluetoothGattService.SERVICE_TYPE_PRIMARY);
            service.addCharacteristic(new BluetoothGattCharacteristic(CODE,
                    BluetoothGattCharacteristic.PROPERTY_WRITE, BluetoothGattCharacteristic.PERMISSION_WRITE));
            server.addService(service);
            advertiser = a.getBluetoothLeAdvertiser();
            if (advertiser == null) { status = "This tablet can't advertise over Bluetooth"; return; }
            AdvertiseSettings settings = new AdvertiseSettings.Builder()
                    .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_BALANCED)
                    .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_LOW)   // near the door only
                    .setConnectable(true)
                    .setTimeout(0)
                    .build();
            AdvertiseData data = new AdvertiseData.Builder().addServiceUuid(new ParcelUuid(SERVICE)).build();
            AdvertiseData scanReply = new AdvertiseData.Builder().setIncludeDeviceName(true).build();
            advertisedName = shortName;
            advertiser.startAdvertising(settings, data, scanReply, advertised);
            status = "Starting";
        } catch (SecurityException e) {
            status = "Bluetooth blocked on this tablet";
        } catch (RuntimeException e) {
            status = "Bluetooth error: " + e.getClass().getSimpleName();
        }
    }

    synchronized void stop() {
        try { if (advertiser != null && advertising) advertiser.stopAdvertising(advertised); } catch (RuntimeException e) { /* ignore */ }
        try { if (server != null) server.close(); } catch (RuntimeException e) { /* ignore */ }
        advertiser = null;
        server = null;
        advertising = false;
        advertisedName = "";
        pending.clear();
    }

    /** Bluetooth names are sent in a 31-byte reply: keep them short and plain. */
    static String clip(String name) {
        String s = name == null ? "" : name.replaceAll("[^A-Za-z0-9 ._-]", "").trim();
        if (s.isEmpty()) s = "TransitTrack bus";
        return s.length() > 24 ? s.substring(0, 24).trim() : s;
    }

    private final AdvertiseCallback advertised = new AdvertiseCallback() {
        @Override public void onStartSuccess(AdvertiseSettings settingsInEffect) {
            advertising = true;
            status = "Ready as " + advertisedName;
            Status.log("Bluetooth boarding ready as " + advertisedName);
        }
        @Override public void onStartFailure(int errorCode) {
            advertising = false;
            status = errorCode == ADVERTISE_FAILED_DATA_TOO_LARGE ? "Bus name too long for Bluetooth"
                    : errorCode == ADVERTISE_FAILED_FEATURE_UNSUPPORTED ? "This tablet can't advertise over Bluetooth"
                    : "Bluetooth advertising failed (" + errorCode + ")";
            Status.log(status);
        }
    };

    private final BluetoothGattServerCallback callback = new BluetoothGattServerCallback() {
        @Override public void onConnectionStateChange(BluetoothDevice device, int s, int newState) {
            if (newState != android.bluetooth.BluetoothProfile.STATE_CONNECTED) {
                synchronized (BleBoarding.this) { pending.remove(device.getAddress()); }
            }
        }

        @Override public void onCharacteristicWriteRequest(BluetoothDevice device, int requestId, BluetoothGattCharacteristic ch,
                                                           boolean preparedWrite, boolean responseNeeded, int offset, byte[] value) {
            boolean ok = CODE.equals(ch.getUuid()) && value != null;
            if (ok && preparedWrite) {
                // Long write: pieces arrive first, then onExecuteWrite.
                synchronized (BleBoarding.this) {
                    ByteArrayOutputStream buf = pending.get(device.getAddress());
                    if (buf == null) { buf = new ByteArrayOutputStream(); pending.put(device.getAddress(), buf); }
                    if (offset != buf.size() || buf.size() + value.length > MAX_CODE) ok = false;
                    else buf.write(value, 0, value.length);
                }
            } else if (ok) {
                ok = offset == 0 && value.length <= MAX_CODE;
                if (ok) deliver(device, value);
            }
            if (responseNeeded && server != null) {
                server.sendResponse(device, requestId, ok ? BluetoothGatt.GATT_SUCCESS : BluetoothGatt.GATT_FAILURE, offset, value);
            }
        }

        @Override public void onExecuteWrite(BluetoothDevice device, int requestId, boolean execute) {
            ByteArrayOutputStream buf;
            synchronized (BleBoarding.this) { buf = pending.remove(device.getAddress()); }
            if (execute && buf != null) deliver(device, buf.toByteArray());
            if (server != null) server.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null);
        }
    };

    /** Passes a boarding code on to the page, refusing junk and bursts. */
    private void deliver(BluetoothDevice device, byte[] bytes) {
        String text = new String(bytes, StandardCharsets.UTF_8).trim();
        if (!text.startsWith("tt-code:") || text.length() > MAX_CODE || !text.matches("[\\x21-\\x7e]+")) {
            Status.log("Bluetooth: ignored something that isn't a boarding code");
            return;
        }
        long now = System.currentTimeMillis();
        synchronized (this) {
            Long last = lastFrom.get(device.getAddress());
            if (last != null && now - last < SAME_PHONE_GAP_MS) return;
            if (now - recent[recentAt] < 60000) { Status.log("Bluetooth: too many boarding codes in a minute"); return; }
            recent[recentAt] = now;
            recentAt = (recentAt + 1) % MAX_PER_MINUTE;
            lastFrom.put(device.getAddress(), now);
            if (lastFrom.size() > 200) lastFrom.clear();
        }
        Status.log("Bluetooth: boarding code received");
        sink.code(text);
    }
}
