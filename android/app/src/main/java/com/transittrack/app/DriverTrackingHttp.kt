package com.transittrack.app

import org.json.JSONObject
import java.net.URL
import javax.net.ssl.HttpsURLConnection

internal object DriverTrackingHttp {
 class Rejected(val status:Int,val retrySeconds:Long=0):Exception("TRACKING_HTTP")
 fun post(body:JSONObject):JSONObject {
  val c=URL("https://ghqpznxqngvhmkiwcauj.supabase.co/functions/v1/driverSession").openConnection() as HttpsURLConnection
  try{
   c.instanceFollowRedirects=false;c.requestMethod="POST";c.connectTimeout=8000;c.readTimeout=8000;c.doOutput=true
   c.setRequestProperty("X-App-Id","6a98b192be27b5f9635020ba");c.setRequestProperty("Content-Type","application/json")
   val bytes=body.toString().toByteArray(Charsets.UTF_8);require(bytes.size<64000);c.setFixedLengthStreamingMode(bytes.size)
   c.outputStream.use{it.write(bytes)}
   if(c.responseCode!=200)throw Rejected(c.responseCode,c.getHeaderField("Retry-After")?.toLongOrNull()?.coerceIn(0,3600)?:0)
   val bytesOut=c.inputStream.use{input->val out=java.io.ByteArrayOutputStream();val chunk=ByteArray(1024);while(true){val n=input.read(chunk);if(n<0)break;check(out.size()+n<=16384);out.write(chunk,0,n)};out.toByteArray()}
   return JSONObject(String(bytesOut,Charsets.UTF_8))
  }finally{c.disconnect()}
 }
 fun credentials(lease:JSONObject,action:String)=JSONObject().apply{
  for(k in listOf("device_id","device_token","driver_grant","expected_device_id","expected_company_id","expected_vehicle_id"))put(k,lease.getString(k))
  put("action",action);put("native_background",true)
 }
 fun binding(lease:JSONObject)=org.json.JSONArray(listOf(lease.getString("expected_device_id"),lease.getString("expected_company_id"),lease.getString("expected_vehicle_id"))).toString()
}
