package com.transittrack.app

import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjection
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.util.Log
import org.json.JSONArray
import org.webrtc.*
import kotlinx.coroutines.*
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** Saved-file data channel only. Does not open a camera, microphone or screen capture. */
class DirectRecordingPeer(private val context:Context, private val onCommand:(String)->Unit, private val onReady:()->Unit, private val onClosed:(String)->Unit) {
 private val factory:PeerConnectionFactory
 private var peer:PeerConnection?=null
 private var channel:DataChannel?=null
 private val candidates=SupportIceCandidates()
 @Volatile private var gatheringComplete=false
 @Volatile private var gatheringState="NEW"
 @Volatile private var iceCounts="H0/S0/R0"
 @Volatile private var relayError=0
 @Volatile private var relayTransport="NONE"
 @Volatile private var relayErrorEvents=0
 fun diagnostics():String {
  val network=try {
   val manager=context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
   val caps=manager.getNetworkCapabilities(manager.activeNetwork)
   when {
    caps==null->"NONE"
    caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)->"WIFI"
    caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)->"CELL"
    else->"OTHER"
   }
  }catch(_:Exception){"UNKNOWN"}
  return iceCounts+" E"+relayError+" "+relayTransport+" "+network+" G"+gatheringState
 }
 private val connected=CompletableDeferred<Unit>()
 @Volatile private var closed=false
 init {
  PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(context).createInitializationOptions())
  factory=PeerConnectionFactory.builder().createPeerConnectionFactory()
 }
 suspend fun offer(ice:JSONArray):String {
  val servers=mutableListOf<PeerConnection.IceServer>()
  var requireRelay=false
  require(ice.length()<=4)
  for(i in 0 until ice.length()) {
   val item=ice.getJSONObject(i);val urls=item.getJSONArray("urls")
   require(urls.length() in 1..3)
   val values=(0 until urls.length()).map{urls.getString(it)}
   require(values.all{it.matches(Regex("^(stun|turn|turns):[A-Za-z0-9.-]+:[0-9]{1,5}(\\?transport=(udp|tcp))?$"))})
   if(values.any{it.startsWith("turn:") || it.startsWith("turns:")}) {
    requireRelay=true
    relayTransport=when {
     values.any{it.startsWith("turns:")}->"TLS"
     values.any{it.endsWith("transport=tcp")}->"TCP"
     else->"UDP"
    }
   }
   servers.add(PeerConnection.IceServer.builder(values).setUsername(item.optString("username")).setPassword(item.optString("credential")).createIceServer())
  }
  val cfg=PeerConnection.RTCConfiguration(servers).apply {sdpSemantics=PeerConnection.SdpSemantics.UNIFIED_PLAN
   continualGatheringPolicy=PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
  }
  peer=factory.createPeerConnection(cfg,object:PeerConnection.Observer {
   override fun onSignalingChange(state:PeerConnection.SignalingState) {}
   override fun onIceConnectionChange(state:PeerConnection.IceConnectionState) {
    if(state==PeerConnection.IceConnectionState.FAILED || state==PeerConnection.IceConnectionState.DISCONNECTED)lost()
   }
   override fun onConnectionChange(state:PeerConnection.PeerConnectionState) {
    if(state==PeerConnection.PeerConnectionState.CONNECTED)connected.complete(Unit)
    else if(state==PeerConnection.PeerConnectionState.FAILED || state==PeerConnection.PeerConnectionState.DISCONNECTED)lost()
   }
   private fun lost(){if(!closed)onClosed("PEER_CONNECT")}
   override fun onIceConnectionReceivingChange(receiving:Boolean) {}
   override fun onIceGatheringChange(state:PeerConnection.IceGatheringState) {gatheringState=state.name;gatheringComplete=state==PeerConnection.IceGatheringState.COMPLETE}
   override fun onIceCandidate(candidate:IceCandidate) {candidates.add(candidate.sdpMLineIndex,candidate.sdp)}
   override fun onIceCandidateError(event:IceCandidateErrorEvent) {
    // Do not log errorText, URL, address, candidate SDP or TURN credentials.
    if(closed)return
    if(event.url?.startsWith("turn:")==true || event.url?.startsWith("turns:")==true) {
     relayError=SupportIceDiagnostics.safeError(event.errorCode)
     if(relayErrorEvents++<8)Log.w("TT-RemoteSupport","Relay callback code="+relayError)
    }
   }
   override fun onIceCandidatesRemoved(candidates:Array<out IceCandidate>) {}
   override fun onAddStream(stream:MediaStream) {lost()}
   override fun onRemoveStream(stream:MediaStream) {}
   override fun onDataChannel(channel:DataChannel) {channel.close();lost()}
   override fun onRenegotiationNeeded() {}
  }) ?: error("Peer creation failed")
  val pc=peer!!
  channel=pc.createDataChannel("tt-recordings-v1",DataChannel.Init()) ?: error("No channel")
  channel!!.registerObserver(object:DataChannel.Observer {
   override fun onBufferedAmountChange(previous:Long){}
   override fun onStateChange(){
    if(closed)return
    if(channel?.state()==DataChannel.State.OPEN)onReady()
    else if(channel?.state()==DataChannel.State.CLOSED)onClosed("CHANNEL")
   }
   override fun onMessage(buffer:DataChannel.Buffer){
    if(closed)return
    if(buffer.binary || buffer.data.remaining()>1024){onClosed("PROTOCOL");return}
    val bytes=ByteArray(buffer.data.remaining());buffer.data.get(bytes)
    onCommand(String(bytes,Charsets.UTF_8))
   }
  })
  val offer=createOffer(pc)
  setDescription(pc,offer,true)

  // An early empty COMPLETE is not terminal: Android may discover Wi-Fi afterward.
  // Keep callback addresses too; localDescription can lag the callback on some builds.
  return withTimeout(20000) {
   var readySdp:String?=null
   while(readySdp==null) {
    check(!closed)
    val current=candidates.merge(pc.localDescription.description)
    iceCounts=SupportIceDiagnostics.counts(current)
    if(SupportIceCandidates.ready(current,gatheringComplete,requireRelay))readySdp=current
    else delay(100)
   }
   readySdp
  }
 }
 suspend fun answer(sdp:String) {
  require(sdp.length<=65536 && sdp.lines().count{it.startsWith("m=")}==1 && sdp.contains("m=application ") && !sdp.contains("m=audio") && !sdp.contains("m=video"))
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
 fun sendJson(value:org.json.JSONObject) {
  check(!closed && channel?.state()==DataChannel.State.OPEN)
  check(channel!!.send(DataChannel.Buffer(java.nio.ByteBuffer.wrap(value.toString().toByteArray(Charsets.UTF_8)),false)))
 }
 suspend fun sendBytes(bytes:ByteArray) {
  require(bytes.size in 1..16384)
  withTimeout(15000){while((channel?.bufferedAmount()?:0)>262144){check(!closed);delay(20)}}
  check(!closed && channel?.state()==DataChannel.State.OPEN)
  check(channel!!.send(DataChannel.Buffer(java.nio.ByteBuffer.wrap(bytes),true)))
 }
 fun close() {
  if(closed)return
  closed=true
  try{channel?.unregisterObserver();channel?.close()}catch(_:Exception){}
  try{peer?.close();peer?.dispose()}catch(_:Exception){}
  // Disposing on the callback thread is forbidden by WebRTC; callers dispatch to main.
  try{channel?.dispose();factory.dispose()}catch(_:Exception){}
 }
}
