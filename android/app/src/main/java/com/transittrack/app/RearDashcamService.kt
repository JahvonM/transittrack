package com.transittrack.app

import android.Manifest
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.hardware.camera2.*
import android.media.MediaRecorder
import android.os.*
import android.util.Range
import android.util.Size
import java.io.File

/** Rear camera only. Foreground local recording; never captures audio or uploads. */
class RearDashcamService:Service() {
 companion object {
  const val STOP="STOP"
  const val PROTECT="PROTECT"
  const val CHANNEL="tt_rear_dashcam"
  const val NOTICE=936
  const val CLIP_MS=120000L
  @Volatile var phase="IDLE"; private set
  @Volatile var message="Rear dashcam is off."; private set
  @Volatile var activeFile=""; private set
  @Volatile var since=0L; private set
  @JvmStatic fun active()=phase in listOf("STARTING","RECORDING","STOPPING")
  private var clipStore:DashcamFiles?=null
  // Share the synchronized store between recorder cleanup, local playback and remote reads.
  @Synchronized @JvmStatic fun files(context:Context):DashcamFiles {
   return clipStore ?: DashcamFiles(File(context.noBackupFilesDir,"rear_dashcam")).also{clipStore=it}
  }
  @JvmStatic fun automatic(context:Context)=context.getSharedPreferences("rear_dashcam",MODE_PRIVATE).getBoolean("auto_shift",false)
  @JvmStatic fun state(context:Context)=com.getcapacitor.JSObject()
   .put("available",true).put("active",active()).put("recording",phase=="RECORDING")
   .put("phase",phase).put("message",message).put("since",since).put("automatic",automatic(context))
 }
 private lateinit var thread:HandlerThread
 private lateinit var worker:Handler
 private val main=Handler(Looper.getMainLooper())
 private lateinit var store:DashcamFiles
 private var camera:CameraDevice?=null
 private var session:CameraCaptureSession?=null
 private var recorder:MediaRecorder?=null
 private var file:File?=null
 private var started=false
 @Volatile private var stopping=false
 private var opening=false
 @Volatile private var destroyed=false
 private var protectCurrent=false
 private var generation=0
 private var lastFrame=0L
 private var startupStage="STORAGE"
 private fun startupFailure(error:Exception) {
  val category=when(error) {
   is CameraAccessException->"CAMERA_${error.reason}"
   is SecurityException->"PERMISSION"
   is IllegalArgumentException->"FORMAT"
   is java.io.IOException->"IO"
   is IllegalStateException->"STATE"
   else->"UNEXPECTED"
  }
  val code="$startupStage/$category"
  android.util.Log.e("TT-RearDashcam","Startup failed: $code")
  shutdown("Rear dashcam could not start. Code: $code",true)
 }
 private var recordingSize=Size(640,480)
 private var orientation=90
 private var fps:Range<Int>?=null
 private val rotate=Runnable { rotateClip() }
 private val startupTimeout=Runnable { if(phase=="STARTING")shutdown("Rear camera did not start. Check camera permissions and other camera users.",true) }
 private val checkHealth=object:Runnable {
  override fun run() {
   if(stopping)return
   try {
    val pm=getSystemService(POWER_SERVICE) as PowerManager
    if(Build.VERSION.SDK_INT>=29 && pm.currentThermalStatus>=PowerManager.THERMAL_STATUS_SEVERE) {
     shutdown("Recording stopped because the tablet is too hot.",true);return
    }
    if(StatFs(noBackupFilesDir.path).availableBytes<DashcamFiles.MIN_FREE) {
     shutdown("Recording stopped to preserve free tablet storage.",true);return
    }
    if(phase=="RECORDING" && SystemClock.elapsedRealtime()-lastFrame>10000) {
     shutdown("Camera frames stopped. The unfinished clip was retained.",true);return
    }
   }catch(_:Exception){shutdown("Recording health check failed.",true);return}
   worker.postDelayed(this,5000)
  }
 }
 override fun onBind(intent:Intent?):IBinder?=null
 override fun onCreate() {
  super.onCreate()
  thread=HandlerThread("TT-RearDashcam");thread.start();worker=Handler(thread.looper)
 }
 override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
  when(intent?.action) {
   STOP->{worker.post{shutdown("Rear dashcam stopped.",false)};return START_NOT_STICKY}
   PROTECT->{if(active())worker.post{protectIncident()} else stopSelf();return START_NOT_STICKY}
  }
  if(intent?.action!="START"){stopSelf();return START_NOT_STICKY}
  if(active())return START_NOT_STICKY
  if(Build.VERSION.SDK_INT>=23 && checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED) {
   phase="ERROR";message="Allow camera access in Rear dashcam before recording.";stopSelf();return START_NOT_STICKY
  }
  if(!TabletCameraLease.acquire("dashcam")) {
   phase="ERROR";message="Close camera live viewing before starting rear recording.";stopSelf();return START_NOT_STICKY
  }
  phase="STARTING";message="Starting rear-camera recording…";since=0
  try { foreground() } catch(_:Exception) {
   TabletCameraLease.release("dashcam");phase="ERROR";message="Android could not start the recording service.";stopSelf();return START_NOT_STICKY
  }
  worker.postDelayed({openRear()},800)
  worker.postDelayed(startupTimeout,15000)
  return START_NOT_STICKY
 }
 private fun foreground() {
  val manager=getSystemService(NOTIFICATION_SERVICE) as NotificationManager
  if(Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(NotificationChannel(CHANNEL,"Rear dashcam",NotificationManager.IMPORTANCE_LOW))
  val open=PendingIntent.getActivity(this,936,Intent(this,RearDashcamActivity::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  val stop=PendingIntent.getService(this,937,Intent(this,RearDashcamService::class.java).setAction(STOP),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  val protect=PendingIntent.getService(this,938,Intent(this,RearDashcamService::class.java).setAction(PROTECT),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  val builder=if(Build.VERSION.SDK_INT>=26)Notification.Builder(this,CHANNEL)else Notification.Builder(this)
  val n=builder.setSmallIcon(android.R.drawable.ic_menu_camera).setContentTitle("Rear dashcam · video only")
   .setContentText(if(phase=="RECORDING")"Recording on this tablet. No audio." else message).setOngoing(true)
   .setContentIntent(open)
   .addAction(Notification.Action.Builder(android.R.drawable.ic_menu_save,"Save incident",protect).build())
   .addAction(Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel,"Stop",stop).build()).build()
  if(Build.VERSION.SDK_INT>=29)startForeground(NOTICE,n,ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA)else startForeground(NOTICE,n)
 }
 private fun openRear() {
  if(stopping)return
  try {
   startupStage="STORAGE"
   store=files(this);store.recover()
   if(!store.roomForNext{StatFs(noBackupFilesDir.path).availableBytes}) {
    shutdown("Storage limit reached. Export or delete protected clips before recording.",true);return
   }
   startupStage="CAMERA_LIST"
   val manager=getSystemService(CAMERA_SERVICE) as CameraManager
   val id=manager.cameraIdList.firstOrNull{manager.getCameraCharacteristics(it).get(CameraCharacteristics.LENS_FACING)==CameraCharacteristics.LENS_FACING_BACK}
    ?:error("Rear unavailable")
   val info=manager.getCameraCharacteristics(id)
   startupStage="RECORDING_SIZE"
   val sizes=info.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)?.getOutputSizes(MediaRecorder::class.java)
   // Select only sizes advertised for MediaRecorder, never invent a capture size.
   val supported=sizes?.filter{it.width>0 && it.height>0 && maxOf(it.width,it.height)<=1920 && minOf(it.width,it.height)<=1080}.orEmpty()
   if(supported.isEmpty()) {
    shutdown("The tablet reports no usable rear video sizes. Code: RECORDING_SIZE/EMPTY",true);return
   }
   recordingSize=supported.firstOrNull{it==Size(640,480)}
    ?:supported.filter{it.width.toLong()*it.height<=640L*480}.maxByOrNull{it.width.toLong()*it.height}
    ?:supported.minByOrNull{it.width.toLong()*it.height}!!
   android.util.Log.i("TT-RearDashcam","Rear recording size: ${recordingSize.width}x${recordingSize.height}")
   startupStage="ORIENTATION"
   val sensorOrientation=info.get(CameraCharacteristics.SENSOR_ORIENTATION)?:90
   val displayRotation=(getSystemService(WINDOW_SERVICE) as android.view.WindowManager).defaultDisplay.rotation*90
   orientation=(sensorOrientation-displayRotation+360)%360
   startupStage="FPS"
   fps=info.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES)?.firstOrNull{it.lower==15 && it.upper==15}
    ?:info.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES)?.firstOrNull{it.lower<=15 && it.upper>=15}
   startupStage="OPEN_CAMERA"
   opening=true
   manager.openCamera(id,object:CameraDevice.StateCallback(){
    override fun onOpened(device:CameraDevice) {
     opening=false
     if(stopping || destroyed){device.close();if(destroyed)thread.quitSafely();return}
     camera=device;beginClip()
    }
    override fun onDisconnected(device:CameraDevice){opening=false;device.close();shutdown("Rear camera disconnected.",true);if(destroyed)thread.quitSafely()}
    override fun onError(device:CameraDevice,error:Int){opening=false;device.close();shutdown("Rear camera is unavailable. Close other camera users and retry.",true);if(destroyed)thread.quitSafely()}
   },worker)
  }catch(error:Exception){opening=false;startupFailure(error)}
 }
 @Suppress("DEPRECATION")
 private fun beginClip() {
  if(stopping)return
  try {
   if(!store.roomForNext{StatFs(noBackupFilesDir.path).availableBytes}) {
    shutdown("Storage limit reached. Protected clips were kept.",true);return
   }
   startupStage="CLIP_FILE"
   val output=store.create(System.currentTimeMillis());file=output;activeFile=output.name
   val token=++generation
   startupStage="ENCODER_SETUP"
   val r=MediaRecorder();recorder=r
   r.setVideoSource(MediaRecorder.VideoSource.SURFACE)
   r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
   r.setVideoEncoder(MediaRecorder.VideoEncoder.H264)
   r.setVideoSize(recordingSize.width,recordingSize.height);r.setVideoFrameRate(15);r.setVideoEncodingBitRate(1000000)
   r.setOrientationHint(orientation);r.setOutputFile(output.path)
   r.setMaxFileSize(24L*1024*1024)
   r.setOnErrorListener{_,_,_->worker.post{if(token==generation)shutdown("Video encoder failed. The unfinished clip was retained.",true)}}
   r.setOnInfoListener{_,what,_->if(what==MediaRecorder.MEDIA_RECORDER_INFO_MAX_FILESIZE_REACHED)worker.post{if(token==generation)rotateClip()}}
   startupStage="ENCODER_PREPARE"
   r.prepare()
   startupStage="CAPTURE_SESSION"
   val surface=r.surface
   val device=camera?:error("No camera")
   val request=device.createCaptureRequest(CameraDevice.TEMPLATE_RECORD).apply{
    addTarget(surface);set(CaptureRequest.CONTROL_MODE,CaptureRequest.CONTROL_MODE_AUTO)
    fps?.let{set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE,it)}
   }.build()
   device.createCaptureSession(listOf(surface),object:CameraCaptureSession.StateCallback(){
    override fun onConfigured(value:CameraCaptureSession) {
     if(stopping || token!=generation){value.close();return}
     session=value
     try {
      startupStage="CAPTURE_REQUEST"
      value.setRepeatingRequest(request,object:CameraCaptureSession.CaptureCallback(){
       override fun onCaptureCompleted(s:CameraCaptureSession,q:CaptureRequest,result:TotalCaptureResult) {
        if(token==generation)lastFrame=SystemClock.elapsedRealtime()
       }
      },worker)
      startupStage="ENCODER_START"
      r.start();started=true
      if(since==0L)since=System.currentTimeMillis()
      lastFrame=SystemClock.elapsedRealtime()
      phase="RECORDING";message="Rear camera recording · ${recordingSize.width}×${recordingSize.height} · no audio."
      worker.removeCallbacks(startupTimeout);worker.removeCallbacks(checkHealth);worker.postDelayed(checkHealth,5000)
      worker.postDelayed(rotate,CLIP_MS)
      main.post{if(!stopping)try{foreground()}catch(_:Exception){worker.post{shutdown("Recording notification failed.",true)}}}
     }catch(error:Exception){startupFailure(error)}
    }
    override fun onConfigureFailed(value:CameraCaptureSession){value.close();if(token==generation)shutdown("Rear recording format was rejected by this tablet.",true)}
   },worker)
  }catch(error:Exception){startupFailure(error)}
 }
 private fun finishClip():Boolean {
  generation++;worker.removeCallbacks(rotate)
  try{session?.stopRepeating()}catch(_:Exception){}
  try{session?.abortCaptures()}catch(_:Exception){}
  try{session?.close()}catch(_:Exception){};session=null
  var good=false
  val r=recorder;recorder=null
  if(r!=null) {
   if(started)try{r.stop();good=true}catch(_:Exception){}
   try{r.reset();r.release()}catch(_:Exception){}
  }
  started=false
  val output=file;file=null;activeFile=""
  if(output!=null)try {
   store.finish(output,good && output.length()>0,protectCurrent || !good)
  }catch(_:Exception){good=false}
  protectCurrent=false
  return good
 }
 private fun rotateClip() {
  if(stopping || recorder==null)return
  phase="STARTING";message="Saving clip and continuing rear recording…"
  if(!finishClip()){shutdown("Clip could not be finalized. Original data was retained.",true);return}
  worker.postDelayed({beginClip()},500)
  worker.postDelayed(startupTimeout,15000)
 }
 private fun protectIncident() {
  if(!active() || !::store.isInitialized)return
  protectCurrent=true
  try {
   store.clips().lastOrNull{!DashcamFiles.partial(it)}?.let{store.protect(it.name)}
   message="Current and previous clips protected from loop deletion."
   main.post{if(!stopping)try{foreground()}catch(_:Exception){}}
  }catch(_:Exception){message="Could not protect the previous clip; current clip will be protected."}
 }
 private fun shutdown(reason:String,error:Boolean) {
  if(stopping)return
  stopping=true;phase="STOPPING";worker.removeCallbacks(startupTimeout);worker.removeCallbacks(checkHealth)
  finishClip()
  try{camera?.close()}catch(_:Exception){};camera=null
  TabletCameraLease.release("dashcam")
  phase=if(error)"ERROR" else "IDLE";message=reason;since=0
  main.post{if(Build.VERSION.SDK_INT>=24)stopForeground(STOP_FOREGROUND_REMOVE) else stopForeground(true);stopSelf()}
 }
 override fun onTaskRemoved(rootIntent:Intent?) {worker.post{shutdown("Rear dashcam stopped when the app was closed.",false)};super.onTaskRemoved(rootIntent)}
 override fun onDestroy() {
  destroyed=true
  worker.post {
   if(!stopping)shutdown("Rear dashcam stopped by Android.",false)
   if(!opening)thread.quitSafely()
  }
  super.onDestroy()
 }
}
