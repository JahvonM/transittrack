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
 private lateinit var heading:TextView
 private lateinit var libraryButton:Button
 private var libraryOpen=false
 private var listKey=""
 private var exportName:String?=null
 private var video:VideoView?=null
 private val poll=object:Runnable{override fun run(){refresh();main.postDelayed(this,1000)}}
 private fun dp(value:Int)=(value*resources.displayMetrics.density).toInt()
 private fun text(value:String,size:Float=16f)=TextView(this).apply{setText(value);textSize=size;setTextColor(Color.rgb(222,235,244));setPadding(0,dp(6),0,dp(6))}
 private fun panel()=LinearLayout(this).apply{
  orientation=LinearLayout.VERTICAL;setPadding(dp(18),dp(14),dp(18),dp(14))
  background=android.graphics.drawable.GradientDrawable().apply{setColor(Color.rgb(15,34,49));cornerRadius=dp(18).toFloat();setStroke(dp(1),Color.rgb(38,69,87))}
  layoutParams=LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=dp(14)}
 }
 private fun action(label:String,primary:Boolean=false,run:()->Unit)=Button(this).apply{
  text=label;isAllCaps=false;textSize=18f;minHeight=dp(56)
  setTextColor(if(primary)Color.rgb(4,23,33) else Color.WHITE)
  backgroundTintList=android.content.res.ColorStateList.valueOf(if(primary)Color.rgb(0,207,223) else Color.rgb(29,54,73))
  setOnClickListener{run()}
 }
 override fun onCreate(saved:Bundle?) {
  super.onCreate(saved)
  exportName=saved?.getString("export_name")
  window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  window.statusBarColor=Color.rgb(8,20,32);window.navigationBarColor=Color.rgb(8,20,32)
  val root=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(20),dp(16),dp(20),dp(20));setBackgroundColor(Color.rgb(8,20,32))}
  val scroll=ScrollView(this);scroll.addView(root);setContentView(scroll)
  root.addView(action("‹ Back to driver screen"){finish()})
  root.addView(text("Rear dashcam",28f))
  root.addView(text("Video saved on this tablet · no sound"))
  val control=panel();root.addView(control)
  heading=text("Ready to record",24f);control.addView(heading)
  status=text("Checking recording status…");control.addView(status)
  val row=LinearLayout(this)
  start=action("Start recording",true){startPressed()}
  stop=action("Stop recording"){send(RearDashcamService.STOP)}.apply{text="Stop"}
  row.addView(start,LinearLayout.LayoutParams(-1,-2));row.addView(stop,LinearLayout.LayoutParams(-1,-2));control.addView(row)
  incident=action("Save incident"){send(RearDashcamService.PROTECT);Toast.makeText(this,"Protecting the current and previous clip",Toast.LENGTH_SHORT).show()}
  control.addView(incident)
  control.addView(text("Save incident keeps the current and previous video from being deleted automatically.",14f))
  libraryButton=action("View saved videos"){libraryOpen=!libraryOpen;clips.visibility=if(libraryOpen)android.view.View.VISIBLE else android.view.View.GONE;listKey="";refresh()}
  root.addView(libraryButton)
  clips=panel().apply{visibility=android.view.View.GONE};root.addView(clips)
  val settings=panel().apply{visibility=android.view.View.GONE}
  root.addView(action("Recording settings & help"){settings.visibility=if(settings.visibility==android.view.View.VISIBLE)android.view.View.GONE else android.view.View.VISIBLE})
  settings.addView(Switch(this).apply {
   text="Record automatically with my shift";textSize=16f;setTextColor(Color.WHITE);minHeight=dp(56)
   isChecked=RearDashcamService.automatic(this@RearDashcamActivity)
   setOnCheckedChangeListener{_,value->getSharedPreferences("rear_dashcam",MODE_PRIVATE).edit().putBoolean("auto_shift",value).apply()}
  })
  settings.addView(text("Saves a new video every 2 minutes. Short gaps occur between clips. Uses up to 1 GB and keeps 512 MB free. Old unprotected videos are replaced automatically. If saved incidents fill storage, recording stops.",14f))
  settings.addView(text("Stop recording before QR scanning or live camera viewing. NFC and GPS can continue. Returning to the driver screen keeps recording; closing the app stops it.",14f))
  settings.addView(text("Playing or exporting protects a video. Delete it when you no longer need it. Export copies it to a location you choose; nothing is uploaded automatically.",14f))
  root.addView(settings)
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
  val phase=s.optString("phase")
  val active=RearDashcamService.active()
  val elapsed=if(s.optLong("since")>0)maxOf(0L,(System.currentTimeMillis()-s.optLong("since"))/1000)else 0L
  val timer=String.format(Locale.getDefault(),"%02d:%02d",elapsed/60,elapsed%60)
  heading.text=when(phase){"RECORDING"->"● Recording · $timer";"STARTING"->"Starting camera…";"STOPPING"->"Saving video…";"ERROR"->"Recording stopped";else->"Ready to record"}
  heading.setTextColor(if(phase=="RECORDING")Color.rgb(255,113,121)else Color.WHITE)
  status.text=s.optString("message")
  start.visibility=if(active)android.view.View.GONE else android.view.View.VISIBLE
  stop.visibility=if(active)android.view.View.VISIBLE else android.view.View.GONE
  stop.text="Stop recording";stop.isEnabled=phase!="STOPPING"
  incident.isEnabled=phase=="RECORDING"
  incident.alpha=if(incident.isEnabled)1f else 0.45f
  try {
   val files=RearDashcamService.files(this).clips().filter{!DashcamFiles.partial(it)}.reversed()
   libraryButton.text=(if(libraryOpen)"Hide saved videos" else "View saved videos")+" (${files.size})"
   if(!libraryOpen)return
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
  button("Save a copy"){export(file.name)}
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
   val file=RearDashcamService.files(this).protect(name)
   val player=VideoView(this);video=player
   val layout=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(16),dp(12),dp(16),dp(12));setBackgroundColor(Color.rgb(8,20,32))}
   val at=file.name.substringBefore("-").toLongOrNull()?:0
   layout.addView(text(SimpleDateFormat("dd MMM · h:mm a",Locale.getDefault()).format(Date(at)),20f))
   layout.addView(text("Saved rear-camera video · no sound",14f))
   layout.addView(player,LinearLayout.LayoutParams(-1,0,1f))
   val clock=text("Loading video…");layout.addView(clock)
   val seek=SeekBar(this).apply{isEnabled=false};layout.addView(seek)
   val controls=LinearLayout(this)
   val pause=action("Pause"){if(player.isPlaying)player.pause()else player.start()}
   controls.addView(action("−10 sec"){player.seekTo(maxOf(0,player.currentPosition-10000))},LinearLayout.LayoutParams(0,-2,1f))
   controls.addView(pause,LinearLayout.LayoutParams(0,-2,1f))
   controls.addView(action("+10 sec"){player.seekTo(minOf(player.duration,player.currentPosition+10000))},LinearLayout.LayoutParams(0,-2,1f))
   layout.addView(controls)
   val dialog=Dialog(this,android.R.style.Theme_Material_NoActionBar)
   layout.addView(action("Close video"){dialog.dismiss()})
   dialog.setContentView(layout)
   var dragging=false
   fun time(ms:Int):String {val seconds=maxOf(0,ms)/1000;return String.format(Locale.getDefault(),"%02d:%02d",seconds/60,seconds%60)}
   val tick=object:Runnable{override fun run(){
    if(!dialog.isShowing)return
    if(!dragging)seek.progress=player.currentPosition
    clock.text=time(player.currentPosition)+" / "+time(player.duration)
    pause.text=if(player.isPlaying)"Pause"else"Play"
    main.postDelayed(this,500)
   }}
   seek.setOnSeekBarChangeListener(object:SeekBar.OnSeekBarChangeListener{
    override fun onStartTrackingTouch(bar:SeekBar){dragging=true}
    override fun onStopTrackingTouch(bar:SeekBar){player.seekTo(bar.progress);dragging=false}
    override fun onProgressChanged(bar:SeekBar,value:Int,fromUser:Boolean){if(fromUser)clock.text=time(value)+" / "+time(player.duration)}
   })
   player.setOnPreparedListener{seek.max=player.duration;seek.isEnabled=true;player.start()}
   player.setOnCompletionListener{pause.text="Play"}
   player.setOnErrorListener{_,_,_->
    seek.isEnabled=false;controls.visibility=android.view.View.GONE
    main.removeCallbacks(tick);clock.text="This video could not be played. Close it and use Save a copy to try another player.";true
   }
   dialog.setOnDismissListener{main.removeCallbacks(tick);player.stopPlayback();if(video===player)video=null}
   dialog.show();dialog.window?.setLayout(-1,-1)
   player.setVideoPath(file.path);main.post(tick)
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
