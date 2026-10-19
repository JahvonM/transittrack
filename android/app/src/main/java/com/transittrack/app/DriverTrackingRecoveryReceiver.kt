package com.transittrack.app

import android.app.*
import android.content.*
import android.os.Build

/** Restores only an opted-in, unexpired tracking lease; never opens camera/screen capture. */
class DriverTrackingRecoveryReceiver:BroadcastReceiver() {
 override fun onReceive(context:Context,intent:Intent){
  if(intent.action !in listOf(Intent.ACTION_BOOT_COMPLETED,Intent.ACTION_MY_PACKAGE_REPLACED))return
  if(!context.getSharedPreferences("tt_driver_background",Context.MODE_PRIVATE).getBoolean("enabled",false))return
  val store=try{DriverTrackingStore(context)}catch(_:Exception){return}
  val lease=try{store.readLease()}catch(_:Exception){null}finally{store.close()}?:return
  if(!DriverTrackingPolicy.leaseValid(System.currentTimeMillis(),lease.optLong("verified_at"),lease.optLong("expires_ms")))return
  // Android 11+ limits location-service starts while in the background. Resume on opening.
  if(Build.VERSION.SDK_INT in 26..29)try{context.startForegroundService(Intent(context,DriverLocationService::class.java))}catch(_:Exception){}
 }
}
