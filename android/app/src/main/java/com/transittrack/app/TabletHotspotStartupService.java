package com.transittrack.app;

import android.app.*;
import android.content.*;
import android.os.*;
import android.provider.Settings;

/** Restores the saved driver hotspot without waiting for the website or a server heartbeat. */
public class TabletHotspotStartupService extends Service {
    private final Handler main = new Handler(Looper.getMainLooper());
    private final TabletPowerPolicy power = new TabletPowerPolicy();
    private boolean pending, owned;
    private int failures;
    private static boolean running;
    static android.content.SharedPreferences prefs(Context c) { return c.getSharedPreferences("transittrack_network",MODE_PRIVATE); }
    static boolean wanted(Context c) {
        android.content.SharedPreferences p=prefs(c);
        return p.getBoolean("enabled",false) && p.getBoolean("always",false) && "driver".equals(p.getString("mode",""));
    }
    static boolean supported(Context c) { return Build.VERSION.SDK_INT == 29 && KioskMode.owner(c); }
    static void start(Context c) {
        if (!wanted(c)) return;
        if (!supported(c)) { prefs(c).edit().putString("startup_code","HOTSPOT_UNSUPPORTED").apply(); return; }
        if (running) return;
        try { c.startForegroundService(new Intent(c,TabletHotspotStartupService.class)); }
        catch (RuntimeException e) { prefs(c).edit().putString("startup_code","HOTSPOT_START_BLOCKED").apply(); }
    }
    private void code(String value) { prefs(this).edit().putString("startup_code",value).apply(); }
    private void failed(String value) { pending=false; code(value); if (++failures>=3) stopSelf(); }
    private final Runnable tick=new Runnable() { public void run() {
        if (!wanted(TabletHotspotStartupService.this) || !supported(TabletHotspotStartupService.this)) { stopSelf(); return; }
        Intent b=registerReceiver(null,new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if(b!=null) { int scale=b.getIntExtra(BatteryManager.EXTRA_SCALE,-1),level=b.getIntExtra(BatteryManager.EXTRA_LEVEL,-1);
            int plugged=b.getIntExtra(BatteryManager.EXTRA_PLUGGED,-1);
            power.update(scale>0 && level>=0 && level<=scale ? Math.round(100f*level/scale) : -1,plugged<0 ? null : plugged!=0); }
        if(power.parked()) {
            if(owned && Boolean.TRUE.equals(TabletHotspotApi.isOn(TabletHotspotStartupService.this))) TabletHotspotApi.request(TabletHotspotStartupService.this,false,ok->{});
            code("LOW_BATTERY");
        } else if (!Settings.System.canWrite(TabletHotspotStartupService.this)) code("HOTSPOT_PERMISSION_REQUIRED");
        else if (Boolean.TRUE.equals(TabletHotspotApi.isOn(TabletHotspotStartupService.this))) { code("HOTSPOT_ON"); owned=true; failures=0; }
        else if(!pending && failures<3) {
            pending=true; code("HOTSPOT_STARTING");
            if(!TabletHotspotApi.request(TabletHotspotStartupService.this,true,ok->{ if(!ok) failed("HOTSPOT_NOT_CONFIRMED"); })) failed("HOTSPOT_UNSUPPORTED");
            else main.postDelayed(()->{
                if(!pending)return; pending=false;
                if(Boolean.TRUE.equals(TabletHotspotApi.isOn(TabletHotspotStartupService.this))) { owned=true; failures=0; code("HOTSPOT_ON"); }
                else failed("HOTSPOT_NOT_CONFIRMED");
            },10000);
        }
        main.postDelayed(this,30000);
    }};
    @Override public int onStartCommand(Intent intent,int flags,int id) {
        if(!wanted(this)||!supported(this)){stopSelf();return START_NOT_STICKY;}
        NotificationManager n=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
        n.createNotificationChannel(new NotificationChannel("driver_hotspot","Driver hotspot",NotificationManager.IMPORTANCE_LOW));
        PendingIntent open=PendingIntent.getActivity(this,17122,new Intent(this,MainActivity.class),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        startForeground(17122,new Notification.Builder(this,"driver_hotspot").setSmallIcon(android.R.drawable.stat_sys_upload)
            .setContentTitle("Driver hotspot startup").setContentText("Maintaining your saved hotspot setting").setContentIntent(open).setOngoing(true).build());
        running=true; main.removeCallbacks(tick); main.post(tick); return START_STICKY;
    }
    @Override public IBinder onBind(Intent intent){return null;}
    @Override public void onDestroy(){running=false;pending=false;main.removeCallbacksAndMessages(null);super.onDestroy();}
}
