package com.transittrack.app

import android.Manifest
import android.content.*
import android.os.Build
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

@CapacitorPlugin(name="DriverBackground",permissions=[Permission(alias="location",strings=[Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION])])
class DriverBackgroundPlugin:Plugin() {
 private val worker=Executors.newSingleThreadExecutor()
 private val configuring=AtomicBoolean(false)
 private fun enabled()=context.getSharedPreferences("tt_driver_background",Context.MODE_PRIVATE).getBoolean("enabled",false)
 @PluginMethod fun getState(call:PluginCall){worker.execute{try{
  val store=DriverTrackingStore(context)
  try{call.resolve(JSObject().put("available",Build.VERSION.SDK_INT>=26).put("enabled",enabled()).put("active",DriverLocationService.active())
   .put("status",DriverLocationService.status()).put("pending",store.count("pending")).put("review",store.count("needs_review"))
  }finally{store.close()}
 }catch(_:Exception){call.reject("GPS storage could not be read. Do not clear tablet data.")}}}
 @PluginMethod fun setEnabled(call:PluginCall){
  if(call.getBoolean("enabled",false)!=true){
   context.getSharedPreferences("tt_driver_background",Context.MODE_PRIVATE).edit().putBoolean("enabled",false).commit()
   stop(call);return
  }
  if(Build.VERSION.SDK_INT<26 || !activity.hasWindowFocus()){call.reject("Open the driver settings on this tablet to enable background GPS.");return}
  if(getPermissionState("location")!=PermissionState.GRANTED){requestPermissionForAlias("location",call,"locationResult");return}
  enable(call)
 }
 @PermissionCallback private fun locationResult(call:PluginCall){
  if(getPermissionState("location")!=PermissionState.GRANTED){call.reject("Location permission is required. Background GPS remains off.");return}
  enable(call)
 }
 private fun enable(call:PluginCall){
  if(!context.getSharedPreferences("tt_driver_background",Context.MODE_PRIVATE).edit().putBoolean("enabled",true).commit()){
   call.reject("Could not save background GPS preference.");return
  }
  call.resolve(JSObject().put("enabled",true))
 }
 @PluginMethod fun stop(call:PluginCall){
  DriverLocationService.stop(context)
  worker.execute{try{val store=DriverTrackingStore(context);try{store.clearLease()}finally{store.close()};call.resolve()}catch(_:Exception){call.reject("Could not clear tracking session. Stop GPS from Android notifications.")}}
 }
 @PluginMethod fun configure(call:PluginCall){
  if(!enabled() || Build.VERSION.SDK_INT<26){call.resolve(JSObject().put("managed",false));return}
  val fields=listOf("device_id","device_token","driver_grant","expected_device_id","expected_company_id","expected_vehicle_id")
  val data=JSONObject()
  for(k in fields){val v=call.getString(k)?:"";if(!(if(k in listOf("device_token","driver_grant"))v.matches(Regex("[a-f0-9]{64}"))else v.matches(Regex("[A-Za-z0-9_-]{1,128}")))){
   call.reject("Current device pairing and driver PIN verification are required.");return
  };data.put(k,v)}
  if(!activity.hasWindowFocus() || getPermissionState("location")!=PermissionState.GRANTED){call.reject("Open the driver app and allow location to start background GPS.");return}
  if(!configuring.compareAndSet(false,true)){call.reject("GPS setup is already being checked.");return}
  worker.execute{
   var store:DriverTrackingStore?=null
   try{
    store=DriverTrackingStore(context)
    val prior=store.readLease()
    val now=System.currentTimeMillis()
    val same=prior!=null && fields.all{prior.optString(it)==data.optString(it)} && DriverTrackingPolicy.leaseValid(now,prior.optLong("verified_at"),prior.optLong("expires_ms"))
    if(same && DriverLocationService.active()){call.resolve(JSObject().put("managed",true));return@execute}
    val response=DriverTrackingHttp.post(DriverTrackingHttp.credentials(data,"background_check"))
    if(response.optBoolean("ok")!=true || response.optBoolean("tracking")!=true){call.resolve(JSObject().put("managed",false));return@execute}
    val server=java.time.Instant.parse(response.getString("server_time")).toEpochMilli()
    check(kotlin.math.abs(now-server)<=60000){"CLOCK"}
    val expiry=minOf(java.time.Instant.parse(response.getString("expires_at")).toEpochMilli(),now+20*3600000L)
    check(DriverTrackingPolicy.leaseValid(now,now,expiry))
    data.put("verified_at",now).put("expires_ms",expiry).put("generation",UUID.randomUUID().toString())
    // Never overwrite a running service's credentials or bus assignment.
    if(DriverLocationService.active()){DriverLocationService.stop(context);call.reject("GPS session is changing. Try again in a moment.");return@execute}
    store.saveLease(data)
    activity.runOnUiThread{
     if(!activity.hasWindowFocus() || !enabled()){call.reject("Return to the driver app to start GPS.");return@runOnUiThread}
     try{context.startForegroundService(Intent(context,DriverLocationService::class.java));call.resolve(JSObject().put("managed",true))}
     catch(_:Exception){call.reject("Android could not start background GPS. Foreground GPS remains available.")}
    }
   }catch(_:Exception){call.reject("Could not verify background GPS. Check connection, tablet time and driver PIN.")}
   finally{store?.close();configuring.set(false)}
  }
 }
 @PluginMethod fun savedPoints(call:PluginCall){worker.execute{try{
  val store=DriverTrackingStore(context);try{call.resolve(JSObject.fromJSONObject(store.page((call.getLong("cursor")?:0L).coerceAtLeast(0),(call.getLong("max")?:0L).coerceAtLeast(0))))}finally{store.close()}
 }catch(_:Exception){call.reject("Saved GPS could not be exported. Data has not been cleared.")}}}
 override fun handleOnDestroy(){worker.shutdown()}
}
