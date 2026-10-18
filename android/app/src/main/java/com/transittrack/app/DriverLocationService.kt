package com.transittrack.app

import android.Manifest
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.*
import android.os.*
import com.getcapacitor.JSObject
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.Executors

/** A visible, driver-authorized foreground location session; no WebView dependency. */
class DriverLocationService:Service() {
 companion object {
  private const val CHANNEL="tt_driver_location"
  private const val NOTICE=938
  private const val STOP="STOP_TRACKING"
  @Volatile private var instance:DriverLocationService?=null
  @Volatile private var message="Background tracking is off"
  @Volatile private var latest:JSObject?=null
  @Volatile private var lastSent=0L
  @Volatile private var visible=false
  @Volatile private var pulseAt=0L
  @JvmStatic fun setVisible(value:Boolean){visible=value}
  @JvmStatic fun pulse(){pulseAt=SystemClock.elapsedRealtime()}
  @JvmStatic fun pageBegin(id:String)=instance?.gate?.pageBegin(id,SystemClock.elapsedRealtime())?:false
  @JvmStatic fun pageEnd(id:String){instance?.gate?.pageEnd(id)}
  private fun pageUploading()=visible && SystemClock.elapsedRealtime()-pulseAt<=20000
  @JvmStatic fun active()=instance!=null
  @JvmStatic fun status()=message
  @JvmStatic fun position()=latest
  @JvmStatic fun lastSentAt()=lastSent
  @JvmStatic fun sourceChanged(){instance?.let{it.main.post{it.changeSource()}}}
  @JvmStatic fun stop(context:Context){context.stopService(Intent(context,DriverLocationService::class.java))}
 }
 private val gate=DriverUploadGate()
 private val main=Handler(Looper.getMainLooper())
 private val network=Executors.newSingleThreadExecutor()
 private lateinit var store:DriverTrackingStore
 private var lease:JSONObject?=null
 private var reader:UsbGpsReader?=null
 private var usb=false
 private var location:LocationManager?=null
 private val power=TabletPowerPolicy()
 private var lastSaved=0L
 private var nextNetwork=0L
 private var failures=0
 private var busy=false
 @Volatile private var closed=false
 private var storageBlocked=false
 private var checkedAt=0L
 private var historyAt=0L
 private var wake:PowerManager.WakeLock?=null
 @Volatile private var durableLatest:JSONObject?=null
 private val ticks=object:Runnable{override fun run(){tick();if(!closed)main.postDelayed(this,15000)}}
 private val locationListener=object:LocationListener {
  override fun onLocationChanged(p:Location) { sample(p.latitude,p.longitude,if(p.hasAccuracy())p.accuracy.toDouble() else 999.0,if(p.hasSpeed())p.speed.toDouble() else 0.0,if(p.hasBearing())p.bearing.toDouble() else Double.NaN,p.time) }
  override fun onProviderEnabled(provider:String){}
  override fun onProviderDisabled(provider:String){report("Tablet GPS is off")}
  @Deprecated("Legacy Android callback") override fun onStatusChanged(provider:String?,status:Int,extras:Bundle?){}
 }
 private val battery=object:BroadcastReceiver(){override fun onReceive(context:Context,intent:Intent){
  val level=intent.getIntExtra(BatteryManager.EXTRA_LEVEL,-1);val scale=intent.getIntExtra(BatteryManager.EXTRA_SCALE,-1)
  val percent=if(level>=0&&scale>0)level*100/scale else -1
  val plugged=intent.getIntExtra(BatteryManager.EXTRA_PLUGGED,-1)
  val old=power.parked();power.update(percent,if(plugged<0)null else plugged!=0)
  if(old!=power.parked())changeSource()
 }}
 private val permission=object:BroadcastReceiver(){override fun onReceive(context:Context,intent:Intent){
  UsbAutoAcceptService.clearPending(context,"gps")
  if(intent.getBooleanExtra(android.hardware.usb.UsbManager.EXTRA_PERMISSION_GRANTED,false))reader?.rescan()
  else {stopSources();report("USB permission denied; reopen GPS settings")}
 }}
 override fun onCreate(){
  super.onCreate();instance=this;closed=false
  store=DriverTrackingStore(this)
  try{lease=store.readLease()}catch(e:Exception){report("Tracking session unavailable; reopen driver app");stopSelf();return}
  if(!validLease()){stopSelf();return}
  try{
   val manager=getSystemService(NOTIFICATION_SERVICE) as NotificationManager
   manager.createNotificationChannel(NotificationChannel(CHANNEL,"Driver GPS tracking",NotificationManager.IMPORTANCE_LOW))
   val open=PendingIntent.getActivity(this,938,Intent(this,MainActivity::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
   val stop=PendingIntent.getService(this,939,Intent(this,DriverLocationService::class.java).setAction(STOP),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
   val notice=Notification.Builder(this,CHANNEL).setSmallIcon(android.R.drawable.ic_menu_mylocation).setContentTitle("Bus location sharing is active")
    .setContentText("GPS continues with the screen off. Tap to open the driver app.").setContentIntent(open).setOngoing(true).addAction(Notification.Action.Builder(null,"Stop background GPS",stop).build()).build()
   if(Build.VERSION.SDK_INT>=29)startForeground(NOTICE,notice,ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)else startForeground(NOTICE,notice)
   val flags=if(Build.VERSION.SDK_INT>=33)Context.RECEIVER_NOT_EXPORTED else 0
   if(Build.VERSION.SDK_INT>=33){registerReceiver(battery,IntentFilter(Intent.ACTION_BATTERY_CHANGED),flags);registerReceiver(permission,IntentFilter(UsbGpsReader.ACTION_PERMISSION),flags)}
   else {registerReceiver(battery,IntentFilter(Intent.ACTION_BATTERY_CHANGED));registerReceiver(permission,IntentFilter(UsbGpsReader.ACTION_PERMISSION))}
   UsbGpsPlugin.nativeOwnershipChanged()
   changeSource();main.post(ticks)
  }catch(e:Exception){report("Android could not start background GPS; reopen driver app");stopSelf()}
 }
 override fun onStartCommand(intent:Intent?,flags:Int,id:Int):Int {
  if(intent?.action==STOP){try{store.clearLease()}catch(_:Exception){};getSharedPreferences("tt_driver_background",MODE_PRIVATE).edit().putBoolean("enabled",false).apply();stopSelf();return START_NOT_STICKY}
  return if(validLease())START_STICKY else {stopSelf();START_NOT_STICKY}
 }
 private fun validLease():Boolean {
  val l=lease?:return false
  return DriverTrackingPolicy.leaseValid(System.currentTimeMillis(),l.optLong("verified_at"),l.optLong("expires_ms")) && getSharedPreferences("tt_driver_background",MODE_PRIVATE).getBoolean("enabled",false)
 }
 private fun report(value:String){message=value;UsbGpsPlugin.nativeOwnershipChanged()}
 private fun stopSources(){reader?.stop();reader=null;location?.removeUpdates(locationListener);location=null;wake?.let{if(it.isHeld)it.release()};wake=null}
 private fun changeSource(){
  if(closed)return
  stopSources()
  if(power.parked()){report("GPS paused: low battery - connect charger");return}
  val remaining=(lease?.optLong("expires_ms")?:0)-System.currentTimeMillis()
  if(remaining<=0){stopSelf();return}
  wake=(getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"TransitTrack:DriverGPS").apply{setReferenceCounted(false);acquire(minOf(remaining+5000,20*3600000L))}
  usb=getSharedPreferences("transittrack_usb_gps",MODE_PRIVATE).getBoolean("enabled",false)
  if(usb){
   report("Looking for USB GPS")
   val next=UsbGpsReader(this,object:UsbGpsReader.Listener{
    override fun onStatus(value:String){main.post{if(!closed&&usb&&!power.parked())report(value)}}
    override fun onFix(f:NmeaGpsParser.Fix){main.post{if(!closed&&usb&&!power.parked())sample(f.latitude,f.longitude,f.accuracy,if(f.speed.isFinite())f.speed else 0.0,f.heading,f.timestamp)}}
   });reader=next;GpsUsbRuntime.worker.execute(next)
  }else try{
   location=getSystemService(LOCATION_SERVICE) as LocationManager
   val fine=checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED
   val coarse=checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED
   if(!fine&&!coarse)throw SecurityException()
   val provider=if(fine)LocationManager.GPS_PROVIDER else LocationManager.NETWORK_PROVIDER
   location?.requestLocationUpdates(provider,5000L,0f,locationListener,Looper.getMainLooper());report("Waiting for tablet GPS")
  }catch(e:Exception){report("Location permission or tablet GPS unavailable")}
 }
 private fun sample(lat:Double,lng:Double,accuracy:Double,speed:Double,heading:Double,t:Long){
  val now=System.currentTimeMillis()
  if(!validLease()){stopSelf();return}
  if(!DriverTrackingPolicy.sample(lat,lng,accuracy,speed,t,now)||power.parked())return
  val coords=JSObject().put("latitude",lat).put("longitude",lng).put("accuracy",accuracy).put("speed",speed)
  if(heading.isFinite())coords.put("heading",heading)
  latest=JSObject().put("coords",coords).put("timestamp",t).put("nativeManaged",true)
  message=if(usb)"Fix (USB background GPS)" else "Fix (tablet background GPS)"
  if(now-lastSaved<8000){latest!!.put("nativePersisted",false);UsbGpsPlugin.nativePosition(latest!!);return}
  val l=lease?:return
  val point=JSONObject().put("queue_id",UUID.randomUUID().toString()).put("lat",lat).put("lng",lng).put("speed",speed).put("accuracy",accuracy)
   .put("timestamp",t).put("t",java.time.Instant.ofEpochMilli(t).toString())
  if(heading.isFinite())point.put("heading",heading)
  for(key in listOf("expected_device_id","expected_company_id","expected_vehicle_id"))point.put(key,l.getString(key))
  try{store.add(DriverTrackingHttp.binding(l),point);durableLatest=point;lastSaved=now;latest!!.put("nativePersisted",true);UsbGpsPlugin.nativePosition(latest!!);tick()}catch(e:Exception){storageBlocked=true;report("GPS storage needs attention; reopen driver app");stopSources()}
 }
 private fun tick(){
  if(closed)return
  if(!validLease()){report("Driver verification expired; reopen driver app");stopSelf();return}
  val now=System.currentTimeMillis()
  if(busy||now<nextNetwork)return
  val l=lease?:return
  if(!gate.nativeBegin(SystemClock.elapsedRealtime()))return
  busy=true
  network.execute{
   var denied=false;var retry=0L
   try{
    check(!closed)
    // Check revocation/tracking even when GPS has no fix. This never renews a grant.
    if(now-checkedAt>=60000){
     val response=DriverTrackingHttp.post(DriverTrackingHttp.credentials(l,"background_check").put("native_tracking_health",JSONObject().put("pending",store.count("pending")).put("review",store.count("needs_review")).put("last_fix_at",latest?.optLong("timestamp")?:0)))
     if(response.optBoolean("tracking")!=true){denied=true;throw IllegalStateException()}
     checkedAt=now
    }
    val bind=DriverTrackingHttp.binding(l);store.reviewOld(bind,now)
    val points=store.batch(bind)
    val newest=durableLatest
    if(!pageUploading() && newest!=null && now-newest.getLong("timestamp")<=30000){
     val live=DriverTrackingHttp.credentials(l,"background_location").put("lat",newest.getDouble("lat")).put("lng",newest.getDouble("lng"))
      .put("speed",newest.getDouble("speed")).put("status",if(newest.getDouble("speed")*3.6>100)"speeding" else "on_trip").put("recorded_at",newest.getString("t"))
     check(!closed)
     val result=DriverTrackingHttp.post(live)
     if(result.opt("tracking")==false){denied=true;throw IllegalStateException()}
     check(result.optBoolean("ok"));lastSent=System.currentTimeMillis()
    }
    if(points.isNotEmpty() && now-historyAt>=60000){
     check(!closed)
     val body=DriverTrackingHttp.credentials(l,"upload_track").put("queue_replay",true).put("points",JSONArray(points))
     try{val result=DriverTrackingHttp.post(body);check(result.optBoolean("ok")&&result.optInt("received")==points.size);store.acknowledge(points);historyAt=now}
     catch(e:DriverTrackingHttp.Rejected){if(e.status==400||e.status==409)store.acknowledge(points,true)else throw e}
    }
    failures=0;nextNetwork=System.currentTimeMillis()+15000
   }catch(e:Exception){
    if(e is DriverTrackingHttp.Rejected){denied=denied||e.status in listOf(401,403,404,409);retry=e.retrySeconds}
    failures++;nextNetwork=System.currentTimeMillis()+DriverTrackingPolicy.retryDelay(failures,retry)
    if(!denied)message="GPS saved on tablet; waiting to upload"
   }finally{gate.nativeEnd();main.post{
    busy=false
    if(denied){try{store.clearLeaseGeneration(l.optString("generation"))}catch(_:Exception){};report("Driver verification or assignment changed; reopen app");stopSelf()}
    else if(!closed){if(storageBlocked && store.count()<9500){storageBlocked=false;changeSource()};UsbGpsPlugin.nativeOwnershipChanged()}
   }}
  }
 }
 override fun onDestroy(){
  closed=true;main.removeCallbacks(ticks);stopSources()
  try{unregisterReceiver(battery)}catch(_:Exception){};try{unregisterReceiver(permission)}catch(_:Exception){}
  instance=null;latest=null;network.shutdown()
  // A worker may still finish an acknowledged upload; close only once it has exited.
  Thread{try{network.awaitTermination(120,java.util.concurrent.TimeUnit.SECONDS)}catch(_:Exception){};store.close()}.start()
  UsbGpsPlugin.nativeOwnershipChanged();stopForeground(STOP_FOREGROUND_REMOVE);super.onDestroy()
 }
 override fun onBind(intent:Intent?):IBinder?=null
}
