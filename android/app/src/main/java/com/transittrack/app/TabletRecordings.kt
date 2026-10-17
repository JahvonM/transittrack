package com.transittrack.app

import android.app.Activity
import android.os.SystemClock
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import com.getcapacitor.PluginCall
import kotlinx.coroutines.*
import org.json.JSONObject
import org.json.JSONArray
import java.net.URL
import javax.net.ssl.HttpsURLConnection

/** Dedicated authenticated file session. No upload endpoint, arbitrary path, delete command or capture. */
class TabletRecordings(private val activity:Activity) {
 private val scope=CoroutineScope(SupervisorJob()+Dispatchers.Main.immediate)
 private data class Session(val id:String,val device:String,val token:String,var deadline:Long=0,
  var peer:DirectRecordingPeer?=null,var job:Job?=null,var pulse:Job?=null,var expiry:Job?=null,
  var transfer:Job?=null,var button:Button?=null,@Volatile var authorizedUntil:Long=0)
 @Volatile private var current:Session?=null
 private val seen=LinkedHashSet<String>()
 @Volatile private var resumed=true
 private val endpoint="https://eager-transit-track-go.base44.app/api/apps/6a98b192be27b5f9635020ba/functions/tabletRecordings"
 fun offer(call:PluginCall){
  val id=call.getString("session_id")?:"";val device=call.getString("device_id")?:"";val token=call.getString("device_token")?:""
  if(!resumed || current!=null || seen.contains(id) || !id.matches(Regex("[A-Za-z0-9_-]{6,128}")) || !device.matches(Regex("[A-Za-z0-9_-]{6,128}")) || !token.matches(Regex("[a-f0-9]{64}"))){call.resolve();return}
  val s=Session(id,device,token);current=s
  s.job=scope.launch {
   try{
    val sent=SystemClock.elapsedRealtime();val proof=api(s,"prepare");check(current===s)
    require(proof.getString("id")==id)
    val ttl=proof.getLong("ttl_ms").coerceAtMost(600000)-(SystemClock.elapsedRealtime()-sent);require(ttl>0)
    s.deadline=SystemClock.elapsedRealtime()+ttl;s.authorizedUntil=SystemClock.elapsedRealtime()+5000
    seen.add(id);while(seen.size>64)seen.remove(seen.first())
    s.expiry=scope.launch{delay(ttl);finish(s)}
    s.pulse=scope.launch{
     try{while(current===s){delay(3000);val before=SystemClock.elapsedRealtime();val r=api(s,"pulse");ensure(s);require(r.optBoolean("ok") && r.optString("id")==id && r.optLong("ttl_ms")>0);s.authorizedUntil=before+7000}}
     catch(_:Exception){finish(s)}
    }
    val button=Button(activity).apply{text="ADMIN RECORDINGS ACCESS · STOP";setTextColor(android.graphics.Color.WHITE);setBackgroundColor(0xffb91c1c.toInt());setOnClickListener{finish(s)}}
    s.button=button
    (activity.window.decorView as ViewGroup).addView(button,FrameLayout.LayoutParams(-2,-2,Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL).apply{bottomMargin=72})
    val peer=DirectRecordingPeer(activity,{raw->scope.launch{command(s,raw)}},{scope.launch{if(current===s)s.button?.text="ADMIN BROWSING RECORDINGS · STOP"}},{scope.launch{finish(s)}})
    s.peer=peer
    val offer=peer.offer(proof.getJSONArray("iceServers"));ensure(s)
    require(api(s,"offer",sdp=offer).optBoolean("ok"))
    var answer:String?=null
    withTimeout(60000){while(answer==null){ensure(s);val r=api(s,"answer_poll");if(!r.isNull("sdp"))answer=r.getString("sdp")else delay(3000)}}
    ensure(s);peer.answer(answer!!)
   }catch(_:Exception){finish(s,"failed")}
  }
  call.resolve()
 }
 private fun ensure(s:Session){check(current===s && resumed && s.deadline>SystemClock.elapsedRealtime())}
 private fun transferAllowed(s:Session){ensure(s);check(SystemClock.elapsedRealtime()<s.authorizedUntil)}
 private suspend fun command(s:Session,raw:String){
  if(current!==s)return
  try{
   transferAllowed(s)
   val b=JSONObject(raw);val id=b.optString("id");require(id.matches(Regex("[a-zA-Z0-9_-]{1,40}")))
   if(s.transfer?.isActive==true){s.peer?.sendJson(JSONObject().put("type","error").put("id",id).put("error","BUSY"));return}
   val op=b.optString("op");require(op=="list" || op=="get")
   s.transfer=scope.launch(Dispatchers.IO){
    try{
     transferAllowed(s)
     val store=RearDashcamService.files(activity)
     if(op=="list"){
      val offset=b.optInt("offset",0);require(offset in 0..100000)
      val from=b.optLong("from",0);val until=b.optLong("until",Long.MAX_VALUE);require(from>=0 && until>from)
      val all=store.clips().filter{!DashcamFiles.partial(it) && (it.name.substringBefore("-").toLongOrNull()?:-1).let{at->at>=from && at<until}}.reversed()
      val page=all.drop(offset).take(40)
      val rows=JSONArray()
      for(f in page)rows.put(JSONObject().put("name",f.name).put("at",f.name.substringBefore("-").toLong()).put("bytes",f.length()).put("protected",DashcamFiles.protectedClip(f)).put("incomplete",f.name.contains("-incomplete")))
      transferAllowed(s);s.peer?.sendJson(JSONObject().put("type","list").put("id",id).put("clips",rows).put("next",if(offset+page.size<all.size)offset+page.size else -1))
     }else{
      val name=b.getString("name");val source=store.find(name)
      require(source.isFile && !DashcamFiles.partial(source) && source.length() in 1..33554432L)
      // Protect before opening so loop cleanup cannot remove an in-flight clip.
      val held=store.protect(name);val bytes=held.length();require(bytes in 1..33554432L)
      transferAllowed(s)
      s.peer?.sendJson(JSONObject().put("type","start").put("id",id).put("name",held.name).put("bytes",bytes))
      val digest=java.security.MessageDigest.getInstance("SHA-256");var sent=0L
      held.inputStream().use{input->
       val buffer=ByteArray(16384)
       while(true){ensureActive();transferAllowed(s);val n=input.read(buffer);if(n<0)break;sent+=n;require(sent<=bytes);val chunk=buffer.copyOf(n);digest.update(chunk);s.peer?.sendBytes(chunk)}
      }
      require(sent==bytes);transferAllowed(s)
      val hash=digest.digest().joinToString(""){"%02x".format(it.toInt() and 255)}
      s.peer?.sendJson(JSONObject().put("type","end").put("id",id).put("bytes",sent).put("sha256",hash))
     }
    }catch(_:CancellationException){throw CancellationException()}
    catch(_:Exception){withContext(Dispatchers.Main){finish(s,"failed")}}
   }
  }catch(_:Exception){finish(s,"failed")}
 }
 private suspend fun api(s:Session,operation:String,sdp:String?=null,reason:String?=null):JSONObject=withContext(Dispatchers.IO){
  val c=URL(endpoint).openConnection() as HttpsURLConnection
  try{
   c.requestMethod="POST";c.instanceFollowRedirects=false;c.connectTimeout=4000;c.readTimeout=4000;c.doOutput=true
   c.setRequestProperty("Content-Type","application/json");c.setRequestProperty("X-App-Id","6a98b192be27b5f9635020ba")
   val b=JSONObject().put("operation",operation).put("session_id",s.id).put("device_id",s.device).put("device_token",s.token)
   if(sdp!=null)b.put("sdp",sdp);if(reason!=null)b.put("reason",reason)
   c.outputStream.use{it.write(b.toString().toByteArray(Charsets.UTF_8))};check(c.responseCode==200)
   val out=java.io.ByteArrayOutputStream()
   c.inputStream.use{input->val buf=ByteArray(2048);while(true){val n=input.read(buf);if(n<0)break;require(out.size()+n<=98304);out.write(buf,0,n)}}
   JSONObject(out.toString("UTF-8"))
  }finally{c.disconnect()}
 }
 private fun finish(s:Session,reason:String="ended"){
  if(current!==s)return
  current=null;s.job?.cancel();s.transfer?.cancel();s.pulse?.cancel();s.expiry?.cancel()
  s.button?.let{(it.parent as? ViewGroup)?.removeView(it)}
  s.peer?.close();s.peer=null
  scope.launch{try{api(s,"stop",reason=reason)}catch(_:Exception){}}
 }
 fun pause(){resumed=false;current?.let{finish(it)}}
 fun resume(){resumed=true}
 fun destroy(){current?.let{finish(it)};scope.cancel()}
}
