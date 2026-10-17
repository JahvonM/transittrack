package com.transittrack.app

import android.Manifest
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.*
import android.view.WindowManager
import android.widget.*
import java.io.File
import java.text.SimpleDateFormat
import java.util.*

/** Local visible controls and explicit export. No remote playback or uploads. */
class RearDashcamActivity:Activity() {
 private val main=Handler(Looper.getMainLooper())
 private lateinit var status:TextView
 private lateinit var clips:LinearLayout
 private lateinit var start:Button
 private lateinit var stop:Button
 private lateinit var incident:Button
 private var listKey=""
 private var exportName:String?=null
 private var video:VideoView?=null
 private val poll=object:Runnable{override fun run(){refresh();main.postDelayed(this,1000)}}
 private fun text(value:String,size:Float=16f)=TextView(this).apply{setText(value);textSize=size;setTextColor(Color.WHITE);setPadding(0,8,0,8)}
 override fun onCreate(saved:Bundle?) {
  super.onCreate(saved)
  exportName=saved?.getString("export_name")
  window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  val root=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(24,20,24,20);setBackgroundColor(Color.rgb(8,20,32))}
  val scroll=ScrollView(this);scroll.addView(root);setContentView(scroll)
  root.addView(text("Rear dashcam",24f))
  root.addView(text("Rear camera only · 480p · video without audio\nSaved on this tablet, including when offline."))
  status=text("Checking recording status…");root.addView(status)
  val row=LinearLayout(this)
  start=Button(this).apply{text="Start recording";setOnClickListener{startPressed()}}
  stop=Button(this).apply{text="Stop";setOnClickListener{send(RearDashcamService.STOP)}}
  row.addView(start,LinearLayout.LayoutParams(0,-2,1f));row.addView(stop,LinearLayout.LayoutParams(0,-2,1f));root.addView(row)
  incident=Button(this).apply{text="Save incident · protect current and previous clip";setOnClickListener{send(RearDashcamService.PROTECT)}}
  root.addView(incident)
  root.addView(CheckBox(this).apply {
   text="Start automatically with a driver shift";setTextColor(Color.WHITE)
   isChecked=RearDashcamService.automatic(this@RearDashcamActivity)
   setOnCheckedChangeListener{_,value->getSharedPreferences("rear_dashcam",MODE_PRIVATE).edit().putBoolean("auto_shift",value).apply()}
  })
  root.addView(text("2-minute clips · 1 GB loop limit · 512 MB kept free\nOld unprotected clips are deleted automatically. Protected clips stay; recording stops if storage cannot be freed."))
  root.addView(text("While recording, stop the dashcam before camera live viewing or QR scanning. NFC and GPS do not use this camera."))
  root.addView(Button(this).apply{text="Return to kiosk";setOnClickListener{finish()}})
  root.addView(text("Saved clips",21f));clips=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL};root.addView(clips)
 }
 private fun startPressed() {
  if(Build.VERSION.SDK_INT>=23 && checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED) {
   requestPermissions(arrayOf(Manifest.permission.CAMERA),61);return
  }
  try {
   if(Build.VERSION.SDK_INT>=26)startForegroundService(Intent(this,RearDashcamService::class.java).setAction("START"))
   else startService(Intent(this,RearDashcamService::class.java).setAction("START"))
  }catch(_:Exception){status.text="Android could not start recording. Keep this screen open and retry."}
 }
 override fun onRequestPermissionsResult(requestCode:Int,permissions:Array<out String>,results:IntArray) {
  super.onRequestPermissionsResult(requestCode,permissions,results)
  if(requestCode==61) {
   status.text=if(results.firstOrNull()==PackageManager.PERMISSION_GRANTED)"Camera allowed. Tap Start recording." else "Camera permission denied. Nothing is recording."
  }
 }
 private fun send(action:String) {if(RearDashcamService.active())startService(Intent(this,RearDashcamService::class.java).setAction(action))}
 private fun refresh() {
  val s=RearDashcamService.state(this)
  status.text=s.optString("message")+(if(s.optBoolean("active"))"\n● "+s.optString("phase") else "")
  start.isEnabled=!RearDashcamService.active();stop.isEnabled=RearDashcamService.active();incident.isEnabled=RearDashcamService.active()
  try {
   val files=RearDashcamService.files(this).clips().filter{!DashcamFiles.partial(it)}.reversed()
   val key=files.joinToString("|"){it.name}
   if(listKey==key && clips.childCount>0)return
   listKey=key;clips.removeAllViews()
   if(files.isEmpty())clips.addView(text("No completed clips yet. Stop recording to finish the current clip."))
   for(file in files)clipRow(file)
  }catch(_:Exception){clips.removeAllViews();clips.addView(text("Could not read saved clips."))}
 }
 private fun clipRow(file:File) {
  val at=file.name.substringBefore("-").toLongOrNull()?:0
  val date=SimpleDateFormat("dd MMM, HH:mm:ss",Locale.getDefault()).format(Date(at))
  val flags=(if(DashcamFiles.protectedClip(file))" · Protected" else "")+(if(file.name.contains("-incomplete"))" · Interrupted, may not play" else "")
  clips.addView(text(date+" · "+(file.length()/1024/1024)+" MB"+flags))
  val row=LinearLayout(this)
  fun button(label:String,action:()->Unit){row.addView(Button(this).apply{text=label;setOnClickListener{action()}},LinearLayout.LayoutParams(0,-2,1f))}
  button("Play"){play(file.name)}
  button("Export"){export(file.name)}
  button("Delete"){
   AlertDialog.Builder(this).setTitle("Delete this clip?").setMessage(if(DashcamFiles.protectedClip(file))"This protected incident clip will be permanently removed from this tablet." else "This clip will be permanently removed from this tablet.")
    .setNegativeButton("Keep",null).setPositiveButton("Delete"){_,_->
     try {if(!RearDashcamService.files(this).delete(file.name))Toast.makeText(this,"Could not delete clip.",Toast.LENGTH_LONG).show()}
     catch(_:Exception){Toast.makeText(this,"Could not delete clip.",Toast.LENGTH_LONG).show()}
     listKey="";refresh()
    }.show()
  }
  clips.addView(row)
 }
 private fun play(name:String) {
  try {
   val file=RearDashcamService.files(this).protect(name) // Hold it out of loop deletion while playing.
   val player=VideoView(this);video=player
   player.setMediaController(MediaController(this).apply{setAnchorView(player)})
   player.setVideoPath(file.path)
   val dialog=AlertDialog.Builder(this).setTitle("Saved rear-camera clip").setView(player)
    .setPositiveButton("Close"){_,_->player.stopPlayback();video=null}.create()
   dialog.setOnDismissListener{player.stopPlayback();video=null}
   player.setOnErrorListener{_,_,_->Toast.makeText(this,"This clip could not be played. You can still export it.",Toast.LENGTH_LONG).show();true}
   dialog.show();player.layoutParams=player.layoutParams.apply{width=-1;height=(resources.displayMetrics.heightPixels*0.6).toInt()};player.start()
   listKey=""
  }catch(_:Exception){Toast.makeText(this,"Clip is unavailable.",Toast.LENGTH_LONG).show()}
 }
 private fun export(name:String) {
  if(exportName!=null)return
  try {
   val file=RearDashcamService.files(this).protect(name) // Protect before handing control to Android's picker.
   exportName=file.name
   startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).apply{
    addCategory(Intent.CATEGORY_OPENABLE);type="video/mp4";putExtra(Intent.EXTRA_TITLE,file.name)
   },62)
  }catch(_:Exception){exportName=null;Toast.makeText(this,"Could not open export.",Toast.LENGTH_LONG).show()}
 }
 @Deprecated("Android activity result callback")
 override fun onActivityResult(requestCode:Int,resultCode:Int,data:Intent?) {
  super.onActivityResult(requestCode,resultCode,data)
  if(requestCode!=62)return
  val name=exportName;exportName=null
  if(resultCode!=RESULT_OK || name==null || data?.data==null)return
  val uri=data.data!!
  Thread{
   val ok=try {
    val file=RearDashcamService.files(this).find(name)
    contentResolver.openOutputStream(uri,"w")!!.use{out->file.inputStream().use{input->input.copyTo(out)}};true
   }catch(_:Exception){false}
   main.post{if(!isDestroyed)Toast.makeText(this,if(ok)"Clip exported. Original remains protected." else "Export failed. Original clip remains on this tablet.",Toast.LENGTH_LONG).show()}
  }.start()
 }
 override fun onSaveInstanceState(out:Bundle){out.putString("export_name",exportName);super.onSaveInstanceState(out)}
 override fun onResume(){super.onResume();main.post(poll)}
 override fun onPause(){main.removeCallbacks(poll);video?.pause();super.onPause()}
 override fun onDestroy(){main.removeCallbacksAndMessages(null);video?.stopPlayback();video=null;super.onDestroy()}
}
