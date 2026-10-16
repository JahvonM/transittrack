package com.transittrack.app

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.SystemClock
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import androidx.activity.result.ActivityResult
import com.getcapacitor.*
import com.getcapacitor.annotation.*
import kotlinx.coroutines.*
import org.json.JSONObject
import java.net.URL
import javax.net.ssl.HttpsURLConnection

/** The page supplies IDs only. Native HTTPS verifies every request; no capture without local approval. */
@CapacitorPlugin(name="TabletSupport", permissions=[Permission(alias="camera", strings=[Manifest.permission.CAMERA])])
class TabletSupportPlugin : Plugin() {
 private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
 private data class Session(val id:String, val device:String, val key:String, var capability:String="", var deadline:Long=0,
                            var job:Job?=null, var watchdog:Job?=null, var pulse:Job?=null, var peer:DirectSupportPeer?=null,
                            var dialog:AlertDialog?=null, var button:Button?=null, var capturing:Boolean=false)
 private var current:Session?=null
 private var resumed=true
 private val seen=LinkedHashSet<String>()
 private val endpoint="https://eager-transit-track-go.base44.app/api/apps/6a98b192be27b5f9635020ba/functions/tabletSupport"

 @PluginMethod fun getCapabilities(call:PluginCall) {
  call.resolve(JSObject().put("remoteViewingReady",true).put("screenConsentRequired",true)
   .put("transport","webrtc").put("localApprovalRequired",true).put("audio",false).put("recording",false))
 }
 @PluginMethod fun getState(call:PluginCall) {call.resolve(JSObject().put("cameraReserved",current?.capability?.startsWith("camera_")==true))}
 private fun stateChanged() {notifyListeners("state",JSObject().put("cameraReserved",current?.capability?.startsWith("camera_")==true))}
 @PluginMethod fun offer(call:PluginCall) {
  val id=call.getString("session_id") ?: ""; val device=call.getString("device_id") ?: ""; val key=call.getString("device_token") ?: ""
  activity.runOnUiThread {
   if(current!=null || seen.contains(id) || !resumed || !id.matches(Regex("[A-Za-z0-9_-]{6,128}")) ||
    !device.matches(Regex("[A-Za-z0-9_-]{6,128}")) || !key.matches(Regex("[a-f0-9]{64}"))) {call.resolve(); return@runOnUiThread}
   val s=Session(id,device,key); current=s
   s.job=scope.launch {
    try {
     val sentAt=SystemClock.elapsedRealtime()
     val proof=api(s,"prepare")
     ensureCurrent(s)
     s.capability=proof.getString("capability")
     require(s.capability in listOf("screen","camera_front","camera_back"))
     require(proof.getString("id")==s.id)
     val ttl=proof.getLong("ttl_ms").coerceAtMost(600000)-(SystemClock.elapsedRealtime()-sentAt); require(ttl>0)
     s.deadline=SystemClock.elapsedRealtime()+ttl
     stateChanged()
     seen.add(id); while(seen.size>64)seen.remove(seen.first())
     s.watchdog=scope.launch { delay(ttl); finish(s,"expired") }
     // Authorization checks continue while approval is pending, too.
     s.pulse=scope.launch {
      try { while(current===s) { delay(5000); val r=api(s,"pulse"); require(r.optBoolean("ok") && r.optString("id")==s.id && r.optLong("ttl_ms")>0) } }
      catch(_:Exception) { if(current===s) finish(s,"failed") }
     }
     val label=when(s.capability) {"screen"->"screen";"camera_front"->"front camera";else->"rear camera"}
     s.dialog=AlertDialog.Builder(activity).setTitle("Allow admin live viewing?")
      .setMessage("${proof.optString("admin_name","Administrator")} requests your $label. Video only, no audio or recording. Ends within 10 minutes. You can stop at any time.")
      .setPositiveButton("Allow") {_,_ ->
       if(current!==s)return@setPositiveButton
       if(s.capability=="screen") {
        val manager=activity.getSystemService(Activity.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        startActivityForResult(call,manager.createScreenCaptureIntent(),"screenResult")
       } else if(getPermissionState("camera") != PermissionState.GRANTED) {
        requestPermissionForAlias("camera",call,"cameraResult")
       } else { call.resolve(); startCapture(s,null) }
      }.setNegativeButton("Decline") {_,_->call.resolve();finish(s,"denied")}
      .setOnCancelListener {call.resolve();finish(s,"denied")}.create()
     s.dialog?.show()
    } catch(_:Exception) { call.reject("Remote viewing request unavailable"); finish(s,"failed") }
   }
  }
 }
 @ActivityCallback private fun screenResult(call:PluginCall?, result:ActivityResult) {
  val s=current
  call?.resolve()
  if(s==null || call?.getString("session_id")!=s.id)return
  if(result.resultCode!=Activity.RESULT_OK || result.data==null) {finish(s,"denied");return}
  startCapture(s,result.data)
 }
 @PermissionCallback private fun cameraResult(call:PluginCall) {
  call.resolve();val s=current ?:return
  if(call.getString("session_id")!=s.id)return
  if(getPermissionState("camera")==PermissionState.GRANTED)startCapture(s,null) else finish(s,"denied")
 }
 private fun ensureCurrent(s:Session) { check(current===s); if(s.deadline>0)check(SystemClock.elapsedRealtime()<s.deadline) }
 private fun startCapture(s:Session, projection:Intent?) {
  s.job=scope.launch {
   try {
    repeat(20) { if(!resumed)delay(100) }; check(resumed); ensureCurrent(s)
    val auth=api(s,"publish");ensureCurrent(s)
    require(auth.getString("id")==s.id && auth.getString("capability")==s.capability && auth.getLong("ttl_ms")>0)
    val pulse=api(s,"pulse");require(pulse.optBoolean("ok") && pulse.optLong("ttl_ms")>0)
    ensureCurrent(s);check(resumed)
    val button=Button(activity).apply {
     text="ADMIN VIEW CONNECTING · STOP";setTextColor(android.graphics.Color.WHITE);setBackgroundColor(0xffb91c1c.toInt())
     setOnClickListener {finish(s,"ended")}
    }
    s.button=button
    (activity.window.decorView as ViewGroup).addView(button,FrameLayout.LayoutParams(
     ViewGroup.LayoutParams.WRAP_CONTENT,ViewGroup.LayoutParams.WRAP_CONTENT,Gravity.TOP or Gravity.CENTER_HORIZONTAL).apply{topMargin=48})
    s.capturing=true
    if(s.capability=="screen") {
     require(projection!=null)
     SupportProjectionService.ready=false
     SupportProjectionService.stopAction={scope.launch {finish(s,"ended")}}
     val service=Intent(context,SupportProjectionService::class.java)
     if(android.os.Build.VERSION.SDK_INT>=26)context.startForegroundService(service)else context.startService(service)
     withTimeout(3000){while(!SupportProjectionService.ready)delay(50)}
    }
    ensureCurrent(s);check(resumed)
    val peer=DirectSupportPeer(context,s.capability){scope.launch{finish(s,"failed")}};s.peer=peer
    val offer=withTimeout(25000){peer.offer(auth.getJSONArray("iceServers"),projection)}
    ensureCurrent(s)
    require(api(s,"offer",sdp=offer).optBoolean("ok"))
    var answer:String?=null
    withTimeout(45000) {
     while(answer==null) {
      ensureCurrent(s)
      val response=api(s,"answer_poll")
      if(!response.isNull("sdp"))answer=response.getString("sdp")
      if(answer==null)delay(3000)
     }
    }
    ensureCurrent(s)
    peer.answer(answer!!)
    ensureCurrent(s)
    require(api(s,"started").optBoolean("ok"))
    s.button?.text="LIVE ADMIN VIEW · STOP"
   } catch(_:Exception) {finish(s,"failed")}
  }
 }
 private suspend fun api(s:Session, op:String, reason:String?=null, sdp:String?=null):JSONObject=withContext(Dispatchers.IO) {
  withTimeout(10000) {
   val connection=URL(endpoint).openConnection() as HttpsURLConnection
   try {
    connection.requestMethod="POST";connection.instanceFollowRedirects=false;connection.connectTimeout=4000;connection.readTimeout=4000
    connection.setRequestProperty("Content-Type","application/json")
    connection.setRequestProperty("X-App-Id","6a98b192be27b5f9635020ba")
    connection.doOutput=true
    val body=JSONObject().put("operation",op).put("session_id",s.id).put("device_id",s.device).put("device_token",s.key)
    if(reason!=null)body.put("reason",reason)
    if(sdp!=null)body.put("sdp",sdp)
    connection.outputStream.use{it.write(body.toString().toByteArray(Charsets.UTF_8))}
    check(connection.responseCode==200)
    val bytes=connection.inputStream.use { input ->
     val output=java.io.ByteArrayOutputStream(); val buffer=ByteArray(2048)
     while(true) { val count=input.read(buffer); if(count<0)break; require(output.size()+count<=98304); output.write(buffer,0,count) }
     output.toByteArray()
    }
    JSONObject(String(bytes,Charsets.UTF_8))
   } finally {connection.disconnect()}
  }
 }
 private fun finish(s:Session,reason:String) {
  if(current!==s)return
  current=null
  stateChanged()
  s.job?.cancel();s.pulse?.cancel();s.watchdog?.cancel()
  s.dialog?.dismiss();s.button?.let{(it.parent as? ViewGroup)?.removeView(it)}
  try{s.peer?.close()}catch(_:Exception){}
  s.peer=null
  SupportProjectionService.stopAction=null
  context.stopService(Intent(context,SupportProjectionService::class.java))
  scope.launch {try{api(s,"stop",reason)}catch(_:Exception){}}
 }
 @PluginMethod fun stop(call:PluginCall) {activity.runOnUiThread {current?.let{finish(it,"ended")};call.resolve()}}
 override fun handleOnResume() {resumed=true}
 override fun handleOnPause() {resumed=false;current?.let{if(it.capturing)finish(it,"ended")}}
 override fun handleOnDestroy() {current?.let{finish(it,"ended")};scope.cancel()}
}
