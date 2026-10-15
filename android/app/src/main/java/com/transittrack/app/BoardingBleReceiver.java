package com.transittrack.app;

import android.bluetooth.*;
import android.bluetooth.le.*;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;
import android.os.SystemClock;
import java.util.UUID;

/** Foreground GATT server. Each start owns callbacks; stopped sessions cannot deliver. */
final class BoardingBleReceiver {
    static final UUID SERVICE = UUID.fromString("7a1c0d3e-5b6f-4c2a-9e41-2f7d8b6a1c01");
    static final UUID CODE = UUID.fromString("7a1c0d3e-5b6f-4c2a-9e41-2f7d8b6a1c02");
    interface Sink { void status(String status); void code(String code); }
    private final Context context;
    private final Sink sink;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final BoardingBleProtocol protocol = new BoardingBleProtocol();
    private BluetoothAdapter adapter;
    private BluetoothGattServer server;
    private BluetoothLeAdvertiser advertiser;
    private AdvertiseCallback advertisingCallback;
    private volatile int generation;
    private boolean active;
    private String busName = "", originalName = null;
    private String ownedName = null;

    BoardingBleReceiver(Context context, Sink sink) {
        this.context = context.getApplicationContext(); this.sink = sink;
    }
    void start(String name) {
        String clipped = BoardingBleProtocol.name(name);
        if (active && clipped.equals(busName)) return;
        stop();
        final int epoch = generation;
        busName = clipped;
        try {
            BluetoothManager manager = (BluetoothManager) context.getSystemService(Context.BLUETOOTH_SERVICE);
            adapter = manager == null ? null : manager.getAdapter();
            if (adapter == null) { sink.status("No Bluetooth on this tablet"); return; }
            if (!adapter.isEnabled()) { sink.status("Bluetooth is off - turn it on in Android settings"); return; }
            if (!adapter.isMultipleAdvertisementSupported()) { sink.status("This tablet cannot advertise Bluetooth boarding"); return; }
            active = true;
            if (!clipped.equals(adapter.getName())) {
                if (originalName == null) originalName = adapter.getName();
                ownedName = clipped;
                if (!adapter.setName(clipped)) { fail(epoch, "Could not set the bus Bluetooth name"); return; }
                sink.status("Setting bus Bluetooth name");
            }
            waitForName(manager, epoch, SystemClock.elapsedRealtime() + 4000);
        } catch (SecurityException error) { fail(epoch, "Bluetooth permission is required"); }
        catch (RuntimeException error) { fail(epoch, "Bluetooth could not start - retry in settings"); }
    }
    private void waitForName(BluetoothManager manager, int epoch, long deadline) {
        if (epoch != generation || !active) return;
        try {
            if (!busName.equals(adapter.getName())) {
                if (SystemClock.elapsedRealtime() >= deadline) { fail(epoch, "Bus Bluetooth name did not update - retry"); return; }
                main.postDelayed(() -> waitForName(manager, epoch, deadline), 200);
                return;
            }
            sink.status("Starting Bluetooth boarding");
            server = manager.openGattServer(context, callback(epoch));
            if (server == null) { fail(epoch, "Bluetooth server could not start"); return; }
            BluetoothGattService service = new BluetoothGattService(SERVICE, BluetoothGattService.SERVICE_TYPE_PRIMARY);
            service.addCharacteristic(new BluetoothGattCharacteristic(CODE,
                BluetoothGattCharacteristic.PROPERTY_WRITE, BluetoothGattCharacteristic.PERMISSION_WRITE));
            if (!server.addService(service)) fail(epoch, "Bluetooth service could not start");
        } catch (SecurityException error) { fail(epoch, "Bluetooth permission is required"); }
        catch (RuntimeException error) { fail(epoch, "Bluetooth could not start - retry in settings"); }
    }
    private void advertise(int epoch) {
        if (epoch != generation || !active) return;
        try {
            advertiser = adapter.getBluetoothLeAdvertiser();
            if (advertiser == null) { fail(epoch, "Bluetooth advertising is unavailable"); return; }
            advertisingCallback = new AdvertiseCallback() {
                @Override public void onStartSuccess(AdvertiseSettings settings) {
                    main.post(() -> { if (epoch == generation && active) sink.status("Ready as " + busName); });
                }
                @Override public void onStartFailure(int error) {
                    main.post(() -> fail(epoch, error == ADVERTISE_FAILED_DATA_TOO_LARGE
                        ? "Bus Bluetooth name is too long" : "Bluetooth advertising failed - retry in settings"));
                }
            };
            AdvertiseSettings settings = new AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_BALANCED)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_LOW).setConnectable(true).setTimeout(0).build();
            advertiser.startAdvertising(settings,
                new AdvertiseData.Builder().addServiceUuid(new ParcelUuid(SERVICE)).build(),
                new AdvertiseData.Builder().setIncludeDeviceName(true).build(), advertisingCallback);
        } catch (SecurityException error) { fail(epoch, "Bluetooth permission is required"); }
        catch (RuntimeException error) { fail(epoch, "Bluetooth advertising could not start"); }
    }
    private void fail(int epoch, String message) {
        if (epoch != generation) return;
        stop(); sink.status(message);
    }
    void stop() {
        generation++; active = false;
        main.removeCallbacksAndMessages(null);
        protocol.clearPending();
        try { if (advertiser != null && advertisingCallback != null) advertiser.stopAdvertising(advertisingCallback); } catch (RuntimeException ignored) { }
        try { if (server != null) server.close(); } catch (RuntimeException ignored) { }
        server = null; advertiser = null; advertisingCallback = null;
    }
    void close() {
        stop();
        try {
            if (adapter != null && originalName != null && ownedName != null && ownedName.equals(adapter.getName()))
                adapter.setName(originalName);
        } catch (RuntimeException ignored) { }
        originalName = null; ownedName = null;
    }
    private BluetoothGattServerCallback callback(final int epoch) {
        return new BluetoothGattServerCallback() {
            @Override public void onServiceAdded(int status, BluetoothGattService service) {
                main.post(() -> {
                    if (epoch != generation) return;
                    if (status == BluetoothGatt.GATT_SUCCESS && SERVICE.equals(service.getUuid())) advertise(epoch);
                    else fail(epoch, "Bluetooth service could not start");
                });
            }
            @Override public void onConnectionStateChange(BluetoothDevice device, int status, int state) {
                main.post(() -> {
                    if (epoch == generation && state != BluetoothProfile.STATE_CONNECTED) {
                        try { protocol.disconnect(device.getAddress()); } catch (RuntimeException ignored) { }
                    }
                });
            }
            @Override public void onCharacteristicWriteRequest(BluetoothDevice device, int requestId,
                BluetoothGattCharacteristic characteristic, boolean prepared, boolean responseNeeded, int offset, byte[] value) {
                final byte[] bytes = value == null ? null : value.clone();
                main.post(() -> {
                    if (epoch != generation || !active) return;
                    boolean ok = false;
                    try {
                        String phone = device.getAddress();
                        long now = SystemClock.elapsedRealtime();
                        if (CODE.equals(characteristic.getUuid())) {
                            if (prepared) ok = protocol.append(phone, offset, bytes, now);
                            else {
                                protocol.disconnect(phone);
                                ok = offset == 0 && deliver(phone, bytes, now);
                            }
                        } else protocol.disconnect(phone);
                        if (responseNeeded) respond(device, requestId, ok, offset, prepared && ok ? bytes : null);
                    } catch (RuntimeException error) { respond(device, requestId, false, offset, null); }
                });
            }
            @Override public void onExecuteWrite(BluetoothDevice device, int requestId, boolean execute) {
                main.post(() -> {
                    if (epoch != generation || !active) return;
                    try {
                        String phone = device.getAddress();
                        long now = SystemClock.elapsedRealtime();
                        byte[] bytes = protocol.execute(phone, execute, now);
                        boolean ok = !execute || (bytes != null && deliver(phone, bytes, now));
                        respond(device, requestId, ok, 0, null);
                    } catch (RuntimeException error) { respond(device, requestId, false, 0, null); }
                });
            }
        };
    }
    private boolean deliver(String phone, byte[] bytes, long now) {
        if (!protocol.reserve(phone, now)) return false;
        String code = BoardingBleProtocol.code(bytes);
        if (code == null) return false;
        sink.code(code); // In-memory only; existing server lookup still decides who boards.
        return true;
    }
    private void respond(BluetoothDevice device, int requestId, boolean ok, int offset, byte[] bytes) {
        try { if (server != null) server.sendResponse(device, requestId,
            ok ? BluetoothGatt.GATT_SUCCESS : BluetoothGatt.GATT_FAILURE, offset, bytes); }
        catch (RuntimeException ignored) { }
    }
}
