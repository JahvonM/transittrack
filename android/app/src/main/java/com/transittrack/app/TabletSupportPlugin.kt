package com.transittrack.app

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.SystemClock
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.Toast
import android.util.Log
import java.net.SocketTimeoutException
import androidx.activity.result.ActivityResult
import com.getcapacitor.*
import com.getcapacitor.annotation.*
import kotlinx.coroutines.*
import org.json.JSONObject
import java.net.URL
import javax.net.ssl.HttpsURLConnection

/** The page supplies IDs only. Native HTTPS authorizes admin requests; Android owns system consent. */
@CapacitorPlugin(name="TabletSupport", permissions=[Permission(alias="camera", strings=[Manifest.permission.CAMERA])])
class TabletSupportPlugin : Plugin() {
 private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
 private data class Session(val id:String, val device:String, val key:String, var capability:String="", var deadline:Long=0,
                            var job:Job?=null, var watchdog:Job?=null, var pulse:Job?=null, var peer:DirectSupportPeer?=null,
                            var button:Button?=null, var capturing:Boolean=false, var stage:String="PREPARE")
 private var current:Session?=null
 private var resumed=true
 private val seen=LinkedHashSet<String>()
 private val endpoint="https://eager-transit-track-go.base44.app/api/apps/6a98b192be27b5f9635020ba/functions/tabletSupport"

 @PluginMethod fun getCapabilities(call:PluginCall) {
  call.resolve(JSObject().put("remoteViewingReady",true).put("screenConsentRequired",true)
   .put("transport","webrtc").put("localApprovalRequired",false).put("audio",false).put("recording",false))
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
     // Authorization checks continue while Android permission is pending, too.
     s.pulse=scope.launch {
      try { while(current===s) { delay(5000); val r=api(s,"pulse"); require(r.optBoolean("ok") && r.optString("id")==s.id && r.optLong("ttl_ms")>0) } }
      catch(e:Exception) { if(current===s) fail(s,e) }
     }
     // The fleet owner authorizes admin requests automatically. Android still owns
     // runtime camera permission and each MediaProjection consent result.
     if(s.capability=="screen") {
      val manager=activity.getSystemService(Activity.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
      startActivityForResult(call,manager.createScreenCaptureIntent(),"screenResult")
     } else if(getPermissionState("camera") != PermissionState.GRANTED) {
      requestPermissionForAlias("camera",call,"cameraResult")
     } else {
      call.resolve()
      startCapture(s,null)
     }
    } catch(e:Exception) { call.reject("Remote viewing request unavailable"); fail(s,e) }
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
    s.stage="PUBLISH"
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
    s.stage="CAPTURE"
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
    s.stage="CAPTURE"
    if(s.capability.startsWith("camera_"))delay(500)
    ensureCurrent(s)
    val peer=DirectSupportPeer(context,s.capability){stage->scope.launch{fail(s,IllegalStateException(),stage)}};s.peer=peer
    val offer=withTimeout(25000){peer.offer(auth.getJSONArray("iceServers"),projection){s.stage=it}}
    ensureCurrent(s)
    s.stage="OFFER"
    require(api(s,"offer",sdp=offer).optBoolean("ok"))
    s.stage="ANSWER_POLL"
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
    s.stage="PEER_CONNECT"
    peer.answer(answer!!)
    ensureCurrent(s)
    s.stage="STARTED"
    require(api(s,"started").optBoolean("ok"))
    s.button?.text="LIVE ADMIN VIEW · STOP"
   } catch(e:Exception) {fail(s,e)}
  }
 }
 private suspend fun api(s:Session, op:String, reason:String?=null, sdp:String?=null, failureCode:String?=null):JSONObject=withContext(Dispatchers.IO) {
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
    if(failureCode!=null)body.put("failure_code",failureCode)
    connection.outputStream.use{it.write(body.toString().toByteArray(Charsets.UTF_8))}
    val status=connection.responseCode
    if(status!=200)throw SupportHttpException(op.uppercase(java.util.Locale.ROOT),status)
    val bytes=connection.inputStream.use { input ->
     val output=java.io.ByteArrayOutputStream(); val buffer=ByteArray(2048)
     while(true) { val count=input.read(buffer); if(count<0)break; require(output.size()+count<=98304); output.write(buffer,0,count) }
     output.toByteArray()
    }
    JSONObject(String(bytes,Charsets.UTF_8))
   } finally {connection.disconnect()}
  }
 }
 private class SupportHttpException(val operation:String,val status:Int):Exception()
 private fun fail(s:Session,error:Exception,callbackStage:String?=null) {
  if(current!==s)return
  val stage=if(error is SupportHttpException)error.operation else callbackStage ?: s.stage
  val suffix=when(error) {
   is SupportHttpException->"HTTP_"+error.status
   is TimeoutCancellationException,is SocketTimeoutException->"TIMEOUT"
   else->"ERROR"
  }
  val code=stage+"_"+suffix
  // Fixed operation/status only. Never log exception text, request body, SDP or device keys.
  Log.w("TT-RemoteSupport","Session failed: "+code)
  Toast.makeText(activity,"Live viewing failed: "+code,Toast.LENGTH_LONG).show()
  finish(s,"failed",code)
 }
 private fun finish(s:Session,reason:String,failureCode:String?=null) {
  if(current!==s)return
  current=null
  stateChanged()
  s.job?.cancel();s.pulse?.cancel();s.watchdog?.cancel()
  s.button?.let{(it.parent as? ViewGroup)?.removeView(it)}
  try{s.peer?.close()}catch(_:Exception){}
  s.peer=null
  SupportProjectionService.stopAction=null
  context.stopService(Intent(context,SupportProjectionService::class.java))
  scope.launch {try{api(s,"stop",reason,failureCode=failureCode)}catch(_:Exception){}}
 }
 @PluginMethod fun stop(call:PluginCall) {activity.runOnUiThread {current?.let{finish(it,"ended")};call.resolve()}}
 override fun handleOnResume() {resumed=true}
 override fun handleOnPause() {resumed=false;current?.let{if(it.capturing)finish(it,"ended")}}
 override fun handleOnDestroy() {current?.let{finish(it,"ended")};scope.cancel()}
}
