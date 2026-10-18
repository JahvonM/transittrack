package com.transittrack.app

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Credentials stay encrypted in no-backup storage. GPS rows contain no credentials. */
internal class DriverTrackingStore(context:Context) {
 private val lease=AtomicFile(File(context.noBackupFilesDir,"driver_tracking_lease"))
 private val db=SQLiteDatabase.openOrCreateDatabase(File(context.noBackupFilesDir,"driver_tracking.sqlite"),null)
 init { db.execSQL("CREATE TABLE IF NOT EXISTS points (id INTEGER PRIMARY KEY AUTOINCREMENT, queue_id TEXT UNIQUE NOT NULL, binding TEXT NOT NULL, t INTEGER NOT NULL, body TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending')") }
 private fun key():SecretKey {
  val ks=KeyStore.getInstance("AndroidKeyStore").apply{load(null)}
  (ks.getKey("tt_driver_tracking_local",null) as? SecretKey)?.let{return it}
  return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply{
   init(KeyGenParameterSpec.Builder("tt_driver_tracking_local",KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
    .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
  }.generateKey()
 }
 @Synchronized fun saveLease(value:JSONObject) {
  val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key())
  val bytes=cipher.iv+cipher.doFinal(value.toString().toByteArray(Charsets.UTF_8))
  val stream=lease.startWrite()
  try {stream.write(bytes);lease.finishWrite(stream)}catch(e:Exception){lease.failWrite(stream);throw e}
 }
 @Synchronized fun readLease():JSONObject? {
  if(!lease.baseFile.exists())return null
  val bytes=lease.readFully();require(bytes.size in 29..8192)
  val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,bytes.copyOfRange(0,12)))
  return JSONObject(String(cipher.doFinal(bytes.copyOfRange(12,bytes.size)),Charsets.UTF_8))
 }
 @Synchronized fun clearLease(){lease.delete()}
 @Synchronized fun count(state:String?=null):Int = db.rawQuery("SELECT COUNT(*) FROM points"+(if(state!=null)" WHERE state=?" else ""),state?.let{arrayOf(it)}).use{it.moveToFirst();it.getInt(0)}
 @Synchronized fun add(binding:String,point:JSONObject) {
  check(count()<10000){"QUEUE_FULL"}
  db.execSQL("INSERT OR IGNORE INTO points(queue_id,binding,t,body) VALUES(?,?,?,?)",arrayOf(point.getString("queue_id"),binding,point.getLong("timestamp"),point.toString()))
 }
 @Synchronized fun reviewOld(binding:String,now:Long) {
  db.execSQL("UPDATE points SET state='needs_review' WHERE state='pending' AND (binding<>? OR t<? OR t>?)",arrayOf(binding,now-72*3600000L,now+60000L))
 }
 @Synchronized fun batch(binding:String):List<JSONObject> = db.rawQuery("SELECT body FROM points WHERE binding=? AND state='pending' ORDER BY id LIMIT 20",arrayOf(binding)).use{c->buildList{while(c.moveToNext())add(JSONObject(c.getString(0)))}}
 @Synchronized fun acknowledge(points:List<JSONObject>,review:Boolean=false) {
  db.beginTransaction()
  try{for(p in points)if(review)db.execSQL("UPDATE points SET state='needs_review' WHERE queue_id=?",arrayOf(p.getString("queue_id")))
   else db.execSQL("DELETE FROM points WHERE queue_id=?",arrayOf(p.getString("queue_id")))
   db.setTransactionSuccessful()
  }finally{db.endTransaction()}
 }
 @Synchronized fun page(after:Long,max:Long):JSONObject {
  val bound=if(max>0)max else db.rawQuery("SELECT COALESCE(MAX(id),0) FROM points",null).use{it.moveToFirst();it.getLong(0)}
  val rows=JSONArray();var last=after
  db.rawQuery("SELECT id,body,state FROM points WHERE id>? AND id<=? ORDER BY id LIMIT 100",arrayOf(after.toString(),bound.toString())).use{c->while(c.moveToNext()){
   last=c.getLong(0);rows.put(JSONObject(c.getString(1)).put("state",c.getString(2)))
  }}
  return JSONObject().put("points",rows).put("cursor",last).put("max",bound).put("done",rows.length()<100 || last>=bound)
 }
 fun close(){db.close()}
}
