package com.transittrack.app

import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjection
import org.json.JSONArray
import org.webrtc.*
import kotlinx.coroutines.*
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** Single video-only sender. It never creates an audio track, renderer or data channel. */
class DirectSupportPeer(private val context:Context, private val capability:String, private val onClosed:()->Unit) {
 private val egl=EglBase.create()
 private val factory:PeerConnectionFactory
 private var peer:PeerConnection?=null
 private var source:VideoSource?=null
 private var track:VideoTrack?=null
 private var capturer:VideoCapturer?=null
 private var texture:SurfaceTextureHelper?=null
 private val gathered=CompletableDeferred<Unit>()
 private val connected=CompletableDeferred<Unit>()
 @Volatile private var closed=false
 init {
  PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(context).createInitializationOptions())
  factory=PeerConnectionFactory.builder()
   .setVideoEncoderFactory(DefaultVideoEncoderFactory(egl.eglBaseContext,true,true))
   .setVideoDecoderFactory(DefaultVideoDecoderFactory(egl.eglBaseContext)).createPeerConnectionFactory()
 }
 suspend fun offer(ice:JSONArray, projection:Intent?, onStage:(String)->Unit={}):String {
  val servers=mutableListOf<PeerConnection.IceServer>()
  require(ice.length()<=4)
  for(i in 0 until ice.length()) {
   val item=ice.getJSONObject(i);val urls=item.getJSONArray("urls")
   require(urls.length() in 1..3)
   val values=(0 until urls.length()).map{urls.getString(it)}
   require(values.all{it.matches(Regex("^(stun|turn|turns):[A-Za-z0-9.-]+:[0-9]{1,5}(\\?transport=(udp|tcp))?$"))})
   servers.add(PeerConnection.IceServer.builder(values).setUsername(item.optString("username")).setPassword(item.optString("credential")).createIceServer())
  }
  val cfg=PeerConnection.RTCConfiguration(servers).apply {sdpSemantics=PeerConnection.SdpSemantics.UNIFIED_PLAN}
  peer=factory.createPeerConnection(cfg,object:PeerConnection.Observer {
   override fun onSignalingChange(state:PeerConnection.SignalingState) {}
   override fun onIceConnectionChange(state:PeerConnection.IceConnectionState) {
    if(state==PeerConnection.IceConnectionState.FAILED || state==PeerConnection.IceConnectionState.DISCONNECTED)lost()
   }
   override fun onConnectionChange(state:PeerConnection.PeerConnectionState) {
    if(state==PeerConnection.PeerConnectionState.CONNECTED)connected.complete(Unit)
    else if(state==PeerConnection.PeerConnectionState.FAILED || state==PeerConnection.PeerConnectionState.DISCONNECTED)lost()
   }
   private fun lost(){if(!closed)onClosed()}
   override fun onIceConnectionReceivingChange(receiving:Boolean) {}
   override fun onIceGatheringChange(state:PeerConnection.IceGatheringState) {if(state==PeerConnection.IceGatheringState.COMPLETE)gathered.complete(Unit)}
   override fun onIceCandidate(candidate:IceCandidate) {}
   override fun onIceCandidatesRemoved(candidates:Array<out IceCandidate>) {}
   override fun onAddStream(stream:MediaStream) {lost()}
   override fun onRemoveStream(stream:MediaStream) {}
   override fun onDataChannel(channel:DataChannel) {channel.close();lost()}
   override fun onRenegotiationNeeded() {}
  }) ?: error("Peer creation failed")
  val screen=capability=="screen"
  capturer=if(screen) {
   require(projection!=null)
   ScreenCapturerAndroid(projection,object:MediaProjection.Callback(){override fun onStop(){if(!closed)onClosed()}})
  } else {
   val enumerator=Camera2Enumerator(context)
   val name=enumerator.deviceNames.firstOrNull{if(capability=="camera_front")enumerator.isFrontFacing(it) else enumerator.isBackFacing(it)}
    ?: error("Selected camera unavailable")
   enumerator.createCapturer(name,object:CameraVideoCapturer.CameraEventsHandler {
    override fun onCameraError(errorDescription:String){if(!closed)onClosed()}
    override fun onCameraDisconnected(){if(!closed)onClosed()}
    override fun onCameraFreezed(errorDescription:String){if(!closed)onClosed()}
    override fun onCameraOpening(cameraName:String){}
    override fun onFirstFrameAvailable(){}
    override fun onCameraClosed(){}
   }) ?: error("Camera unavailable")
  }
  source=factory.createVideoSource(screen)
  texture=SurfaceTextureHelper.create("TT-Support-Capture",egl.eglBaseContext)
  capturer!!.initialize(texture,context,source!!.capturerObserver)
  track=factory.createVideoTrack("tt-support-video",source)
  val pc=peer!!
  pc.addTransceiver(track,RtpTransceiver.RtpTransceiverInit(RtpTransceiver.RtpTransceiverDirection.SEND_ONLY))
  capturer!!.startCapture(if(screen)720 else 640,if(screen)1280 else 360,if(screen)10 else 15)
  val offer=createOffer(pc)
  setDescription(pc,offer,true)
  onStage("ICE_GATHERING")
  withTimeout(15000){gathered.await()}
  check(!closed)
  val sdp=pc.localDescription.description
  require(sdp.contains("a=candidate:")){"No connection address; STUN/TURN configuration required"}
  return sdp
 }
 suspend fun answer(sdp:String) {
  require(sdp.length<=65536 && sdp.lines().count{it.startsWith("m=")}==1 && sdp.contains("a=recvonly") && !sdp.contains("m=audio") && !sdp.contains("m=application"))
  val pc=peer ?:error("No peer")
  setDescription(pc,SessionDescription(SessionDescription.Type.ANSWER,sdp),false)
  withTimeout(20000){connected.await()}
 }
 private suspend fun createOffer(pc:PeerConnection):SessionDescription=suspendCancellableCoroutine { c ->
  pc.createOffer(object:SdpObserver {
   override fun onCreateSuccess(sdp:SessionDescription){if(c.isActive)c.resume(sdp)}
   override fun onCreateFailure(error:String){if(c.isActive)c.resumeWithException(IllegalStateException("Offer failed"))}
   override fun onSetSuccess(){}
   override fun onSetFailure(error:String){}
  },MediaConstraints())
 }
 private suspend fun setDescription(pc:PeerConnection,sdp:SessionDescription,local:Boolean):Unit=suspendCancellableCoroutine { c ->
  val observer=object:SdpObserver {
   override fun onCreateSuccess(sdp:SessionDescription){}
   override fun onCreateFailure(error:String){}
   override fun onSetSuccess(){if(c.isActive)c.resume(Unit)}
   override fun onSetFailure(error:String){if(c.isActive)c.resumeWithException(IllegalStateException("Description failed"))}
  }
  if(local)pc.setLocalDescription(observer,sdp)else pc.setRemoteDescription(observer,sdp)
 }
 fun close() {
  if(closed)return
  closed=true
  try{capturer?.stopCapture()}catch(_:Exception){}
  try{peer?.close();peer?.dispose()}catch(_:Exception){}
  try{capturer?.dispose()}catch(_:Exception){}
  try{track?.dispose();source?.dispose();texture?.dispose()}catch(_:Exception){}
  try{factory.dispose();egl.release()}catch(_:Exception){}
 }
}
