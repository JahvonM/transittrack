package com.transittrack.app

import android.app.*
import android.content.*
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/** Projection notification only; not exported, never starts or resumes capture itself. */
class SupportProjectionService:Service() {
 companion object {
  @Volatile var ready=false
  var stopAction:(()->Unit)?=null
 }
 override fun onBind(intent:Intent?):IBinder?=null
 override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
  if(intent?.action=="STOP") {stopAction?.invoke();stopSelf();return START_NOT_STICKY}
  if(stopAction==null){stopSelf();return START_NOT_STICKY}
  val manager=getSystemService(NOTIFICATION_SERVICE) as NotificationManager
  if(Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(NotificationChannel("tt_support","Tablet screen sharing",NotificationManager.IMPORTANCE_LOW))
  val stop=PendingIntent.getService(this,931,Intent(this,SupportProjectionService::class.java).setAction("STOP"),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  val builder=if(Build.VERSION.SDK_INT>=26)Notification.Builder(this,"tt_support")else Notification.Builder(this)
  val notification=builder.setSmallIcon(android.R.drawable.ic_menu_view).setContentTitle("TransitTrack screen sharing")
   .setContentText("An administrator can view your screen. Tap Stop to end.").setOngoing(true)
   .addAction(Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel,"Stop",stop).build()).build()
  if(Build.VERSION.SDK_INT>=29)startForeground(931,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
  else startForeground(931,notification)
  ready=true
  return START_NOT_STICKY
 }
 override fun onDestroy(){ready=false;super.onDestroy()}
}
