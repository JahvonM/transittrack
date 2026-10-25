package com.transittrack.app

import android.Manifest
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.graphics.Typeface
import android.os.*
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.*
import java.io.File
import java.text.SimpleDateFormat
import java.util.*

/**
 * The rear camera screen on the driver tablet: a big timer, Start/Stop, Save
 * incident, and the saved videos. Video stays on the tablet; nothing is
 * uploaded from here. Same look as kiosk settings (KioskUi).
 */
class RearDashcamActivity : Activity() {
 private val main = Handler(Looper.getMainLooper())
 private lateinit var heading: TextView
 private lateinit var timer: TextView
 private lateinit var status: TextView
 private lateinit var record: Button
 private lateinit var incident: Button
 private lateinit var clips: LinearLayout
 private lateinit var storage: TextView
 private lateinit var storageBar: ProgressBar
 private lateinit var allChip: Button
 private lateinit var incidentChip: Button
 private var onlyIncidents = false
 private var listKey = ""
 private var exportName: String? = null
 private var video: VideoView? = null
 private val poll = object : Runnable { override fun run() { refresh(); main.postDelayed(this, 1000) } }

 private fun dp(v: Int) = KioskUi.dp(this, v.toFloat())

 override fun onCreate(saved: Bundle?) {
  super.onCreate(saved)
  exportName = saved?.getString("export_name")
  window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  window.statusBarColor = KioskUi.INK; window.navigationBarColor = KioskUi.INK
  val wide = KioskUi.wide(this)

  val header = KioskUi.row(this, 16)
  header.setPadding(dp(if (wide) 24 else 16), dp(12), dp(if (wide) 24 else 16), dp(12))
  header.addView(KioskUi.button(this, "‹  Driver screen", KioskUi.Style.SECONDARY) { finish() })
  header.addView(KioskUi.title(this, "Rear camera", 22), KioskUi.weight(1f))
  val usage = KioskUi.column(this, 6)
  storage = KioskUi.text(this, "", 14f, KioskUi.MUTED)
  storageBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
   max = 1000; isIndeterminate = false
   progressDrawable = android.graphics.drawable.LayerDrawable(arrayOf(
    KioskUi.shape(this@RearDashcamActivity, KioskUi.LINE, 4f, 0),
    android.graphics.drawable.ClipDrawable(KioskUi.shape(this@RearDashcamActivity, KioskUi.TEAL, 4f, 0), Gravity.START, android.graphics.drawable.ClipDrawable.HORIZONTAL)
   )).apply { setId(0, android.R.id.background); setId(1, android.R.id.progress) }
  }
  usage.addView(storage)
  usage.addView(storageBar, LinearLayout.LayoutParams(dp(150), dp(8)))
  if (wide) header.addView(usage)

  // Recording
  val rec = KioskUi.panel(this)
  rec.setPadding(dp(26), dp(26), dp(26), dp(26))
  rec.dividerDrawable = android.graphics.drawable.GradientDrawable().apply { setSize(dp(18), dp(18)); setColor(0) }
  rec.showDividers = LinearLayout.SHOW_DIVIDER_MIDDLE
  heading = KioskUi.title(this, "Ready to record", 20)
  timer = KioskUi.text(this, "00:00", 60f, KioskUi.TEXT).apply { typeface = Typeface.MONOSPACE; setLineSpacing(0f, 1f) }
  status = KioskUi.text(this, "Checking the camera…", 16f, KioskUi.SOFT)
  rec.addView(KioskUi.column(this, 4).apply { addView(heading); addView(timer); addView(status) })
  record = KioskUi.button(this, "Start recording", KioskUi.Style.RECORD) { if (RearDashcamService.active()) send(RearDashcamService.STOP) else startPressed() }
  record.minHeight = dp(72); record.minimumHeight = dp(72)
  record.setTextSize(TypedValue.COMPLEX_UNIT_SP, 19f)
  rec.addView(record, KioskUi.fill())
  incident = KioskUi.button(this, "Save incident", KioskUi.Style.SECONDARY) {
   send(RearDashcamService.PROTECT)
   Toast.makeText(this, "Keeping this clip and the one before it", Toast.LENGTH_SHORT).show()
  }.apply {
   setTextColor(KioskUi.SUN)
   background = KioskUi.pressable(this@RearDashcamActivity, 0, 16f, KioskUi.SUN)
  }
  rec.addView(KioskUi.column(this, 6).apply {
   addView(incident, KioskUi.fill())
   addView(KioskUi.text(this@RearDashcamActivity, "Keeps this clip and the one before it.", 14f, KioskUi.MUTED).apply { gravity = Gravity.CENTER })
  }, KioskUi.fill())
  val auto = KioskUi.toggle(this, "Record with my shift", RearDashcamService.automatic(this))
  auto.setOnCheckedChangeListener { _, value -> getSharedPreferences("rear_dashcam", MODE_PRIVATE).edit().putBoolean("auto_shift", value).apply() }
  rec.addView(KioskUi.line(this))
  rec.addView(KioskUi.row(this, 16).apply {
   addView(KioskUi.column(this@RearDashcamActivity, 3).apply {
    addView(KioskUi.text(this@RearDashcamActivity, "Record with my shift", 17f, KioskUi.TEXT))
    addView(KioskUi.text(this@RearDashcamActivity, "Starts when the shift starts, stops when it ends.", 14f, KioskUi.MUTED))
   }, KioskUi.weight(1f))
   addView(auto)
  }, KioskUi.fill())
  rec.addView(KioskUi.text(this, "Video only, no sound. A new clip starts every 2 minutes. Stop recording before scanning a QR code or watching the camera live from Admin.", 14f, KioskUi.MUTED))

  // Saved videos
  val library = KioskUi.panel(this)
  val libHead = KioskUi.row(this, 10)
  libHead.setPadding(dp(22), dp(20), dp(22), dp(12))
  libHead.addView(KioskUi.title(this, "Saved videos", 20), KioskUi.weight(1f))
  allChip = chip("All") { onlyIncidents = false; listKey = ""; refresh() }
  incidentChip = chip("Incidents") { onlyIncidents = true; listKey = ""; refresh() }
  libHead.addView(allChip); libHead.addView(incidentChip)
  library.addView(libHead, KioskUi.fill())
  clips = KioskUi.column(this, 0)
  library.addView(clips, KioskUi.fill())
  library.addView(KioskUi.line(this))
  library.addView(KioskUi.text(this, "Older videos are replaced by new ones when the 1 GB space is full. Incidents, and videos you play or copy, are kept until you delete them.", 14f, KioskUi.MUTED).apply { setPadding(dp(22), dp(14), dp(22), dp(18)) })

  val body: LinearLayout
  if (wide) {
   body = KioskUi.row(this, 24); body.gravity = Gravity.TOP
   body.addView(rec, LinearLayout.LayoutParams(dp(440), ViewGroup.LayoutParams.WRAP_CONTENT))
   body.addView(library, KioskUi.weight(1f))
  } else {
   body = KioskUi.column(this, 18)
   body.addView(rec, KioskUi.fill()); body.addView(usage.apply { setPadding(dp(4), 0, 0, 0) }); body.addView(library, KioskUi.fill())
  }
  body.setPadding(dp(if (wide) 24 else 16), dp(if (wide) 24 else 16), dp(if (wide) 24 else 16), dp(24))

  val root = KioskUi.column(this, 0)
  root.setBackgroundColor(KioskUi.INK)
  root.addView(header, KioskUi.fill())
  root.addView(KioskUi.line(this))
  root.addView(body, KioskUi.fill())
  setContentView(KioskUi.scroll(this, root))
 }

 private fun chip(label: String, run: () -> Unit) = KioskUi.button(this, label, KioskUi.Style.SECONDARY, Runnable(run)).apply {
  minHeight = dp(42); minimumHeight = dp(42); setPadding(dp(16), 0, dp(16), 0); setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
 }
 private fun styleChip(b: Button, on: Boolean) {
  b.setTextColor(if (on) KioskUi.INK else 0xFFC8DCDA.toInt())
  b.background = KioskUi.pressable(this, if (on) KioskUi.TEAL else 0, 99f, if (on) 0 else KioskUi.BORDER)
 }

 private fun startPressed() {
  if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
   requestPermissions(arrayOf(Manifest.permission.CAMERA), 61); return
  }
  try {
   if (Build.VERSION.SDK_INT >= 26) startForegroundService(Intent(this, RearDashcamService::class.java).setAction("START"))
   else startService(Intent(this, RearDashcamService::class.java).setAction("START"))
  } catch (_: Exception) { status.text = "Android couldn't start recording. Keep this screen open and try again." }
 }
 override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, results: IntArray) {
  super.onRequestPermissionsResult(requestCode, permissions, results)
  if (requestCode == 61) {
   status.text = if (results.firstOrNull() == PackageManager.PERMISSION_GRANTED) "Camera allowed. Tap Start recording." else "Camera not allowed, so nothing is recording."
  }
 }
 private fun send(action: String) { if (RearDashcamService.active()) startService(Intent(this, RearDashcamService::class.java).setAction(action)) }

 private fun refresh() {
  val s = RearDashcamService.state(this)
  val phase = s.optString("phase")
  val active = RearDashcamService.active()
  val elapsed = if (s.optLong("since") > 0) maxOf(0L, (System.currentTimeMillis() - s.optLong("since")) / 1000) else 0L
  heading.text = when (phase) { "RECORDING" -> "●  Recording"; "STARTING" -> "Starting the camera…"; "STOPPING" -> "Saving the video…"; "ERROR" -> "Recording stopped"; else -> "Ready to record" }
  heading.setTextColor(when (phase) { "RECORDING" -> 0xFFFF7A7F.toInt(); "ERROR" -> KioskUi.WARN; else -> KioskUi.TEXT })
  timer.text = String.format(Locale.US, "%02d:%02d", elapsed / 60, elapsed % 60)
  timer.setTextColor(if (phase == "RECORDING") KioskUi.TEXT else KioskUi.MUTED)
  status.text = s.optString("message")
  record.text = if (active) "■  Stop recording" else "●  Start recording"
  KioskUi.enable(record, phase != "STOPPING" && phase != "STARTING")
  KioskUi.enable(incident, phase == "RECORDING")
  try {
   val all = RearDashcamService.files(this).clips().filter { !DashcamFiles.partial(it) }.reversed()
   val used = all.sumOf { it.length() }
   storage.text = "${used / 1024 / 1024} MB of 1 GB used"
   storageBar.progress = ((used * 1000) / DashcamFiles.LIMIT).toInt().coerceIn(0, 1000)
   val incidents = all.filter { DashcamFiles.protectedClip(it) }
   allChip.text = "All ${all.size}"; incidentChip.text = "Incidents ${incidents.size}"
   styleChip(allChip, !onlyIncidents); styleChip(incidentChip, onlyIncidents)
   val shown = if (onlyIncidents) incidents else all
   val key = (if (onlyIncidents) "i|" else "a|") + shown.joinToString("|") { it.name }
   if (listKey == key && clips.childCount > 0) return
   listKey = key; clips.removeAllViews()
   if (shown.isEmpty()) {
    clips.addView(KioskUi.line(this))
    clips.addView(KioskUi.text(this, if (onlyIncidents) "No incidents saved. Tap Save incident while recording to keep a clip." else "No saved videos yet. A video is saved every 2 minutes while recording.", 16f, KioskUi.SOFT).apply { setPadding(dp(22), dp(18), dp(22), dp(18)) })
   }
   for (file in shown) clipRow(file)
  } catch (_: Exception) {
   clips.removeAllViews(); clips.addView(KioskUi.text(this, "The saved videos couldn't be read.", 16f, KioskUi.BAD).apply { setPadding(dp(22), dp(18), dp(22), dp(18)) })
  }
 }

 private fun whenSaved(file: File): String {
  val at = file.name.substringBefore("-").toLongOrNull() ?: 0
  val cal = Calendar.getInstance().apply { timeInMillis = at }
  val today = Calendar.getInstance()
  val day = when {
   cal.get(Calendar.YEAR) == today.get(Calendar.YEAR) && cal.get(Calendar.DAY_OF_YEAR) == today.get(Calendar.DAY_OF_YEAR) -> "Today"
   cal.get(Calendar.YEAR) == today.get(Calendar.YEAR) && cal.get(Calendar.DAY_OF_YEAR) == today.get(Calendar.DAY_OF_YEAR) - 1 -> "Yesterday"
   else -> SimpleDateFormat("d MMM", Locale.getDefault()).format(Date(at))
  }
  return day + ", " + SimpleDateFormat("h:mm a", Locale.getDefault()).format(Date(at))
 }
 private fun badge(label: String, fill: Int, ink: Int) = KioskUi.text(this, label, 13f, ink).apply {
  typeface = KioskUi.BOLD; setPadding(dp(8), dp(2), dp(8), dp(2)); background = KioskUi.shape(this@RearDashcamActivity, fill, 6f, 0)
 }
 private fun clipRow(file: File) {
  clips.addView(KioskUi.line(this))
  val wide = KioskUi.wide(this)
  val row = if (wide) KioskUi.row(this, 16) else KioskUi.column(this, 12)
  row.setPadding(dp(22), dp(14), dp(22), dp(14))
  val info = KioskUi.row(this, 14)
  info.addView(KioskUi.text(this, "▶", 22f, KioskUi.TEAL).apply {
   gravity = Gravity.CENTER; background = KioskUi.shape(this@RearDashcamActivity, KioskUi.INK, 10f, 0)
   importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
  }, LinearLayout.LayoutParams(dp(96), dp(56)))
  val words = KioskUi.column(this, 4)
  val titleLine = KioskUi.row(this, 10)
  titleLine.addView(KioskUi.text(this, whenSaved(file), 17f, KioskUi.TEXT).apply { typeface = KioskUi.MEDIUM })
  if (DashcamFiles.protectedClip(file)) titleLine.addView(badge("Incident", KioskUi.SUN, KioskUi.INK))
  if (file.name.contains("-incomplete")) titleLine.addView(badge("Cut short", 0xFF3A2A2A.toInt(), KioskUi.BAD))
  words.addView(titleLine)
  words.addView(KioskUi.text(this, "${maxOf(1, file.length() / 1024 / 1024)} MB" + if (file.name.contains("-incomplete")) ", may not play" else "", 14f, KioskUi.MUTED))
  info.addView(words, KioskUi.weight(1f))
  row.addView(info, if (wide) KioskUi.weight(1f) else KioskUi.fill())
  val actions = KioskUi.row(this, 10)
  actions.addView(KioskUi.button(this, "Play", KioskUi.Style.SECONDARY) { play(file.name) })
  actions.addView(KioskUi.button(this, "Save a copy", KioskUi.Style.QUIET) { export(file.name) })
  actions.addView(KioskUi.button(this, "Delete", KioskUi.Style.DANGER) {
   AlertDialog.Builder(this).setTitle("Delete this video?")
    .setMessage(if (DashcamFiles.protectedClip(file)) "This incident video will be removed from the tablet for good." else "This video will be removed from the tablet for good.")
    .setNegativeButton("Keep it", null).setPositiveButton("Delete") { _, _ ->
     try { if (!RearDashcamService.files(this).delete(file.name)) Toast.makeText(this, "The video couldn't be deleted.", Toast.LENGTH_LONG).show() }
     catch (_: Exception) { Toast.makeText(this, "The video couldn't be deleted.", Toast.LENGTH_LONG).show() }
     listKey = ""; refresh()
    }.show()
  }.apply { contentDescription = "Delete video from " + whenSaved(file) })
  row.addView(actions)
  clips.addView(row, KioskUi.fill())
 }

 private fun play(name: String) {
  try {
   val file = RearDashcamService.files(this).protect(name)
   val player = VideoView(this); video = player
   val layout = KioskUi.column(this, 12)
   layout.setPadding(dp(20), dp(16), dp(20), dp(16)); layout.setBackgroundColor(KioskUi.INK)
   layout.addView(KioskUi.title(this, whenSaved(file), 20))
   layout.addView(KioskUi.text(this, "Rear camera, no sound", 14f, KioskUi.MUTED))
   layout.addView(player, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
   val clock = KioskUi.text(this, "Loading the video…", 16f, KioskUi.SOFT).apply { typeface = Typeface.MONOSPACE }
   layout.addView(clock)
   val seek = SeekBar(this).apply { isEnabled = false }
   layout.addView(seek, KioskUi.fill())
   val controls = KioskUi.row(this, 10)
   val pause = KioskUi.button(this, "Pause", KioskUi.Style.SECONDARY) { if (player.isPlaying) player.pause() else player.start() }
   controls.addView(KioskUi.button(this, "Back 10 s", KioskUi.Style.SECONDARY) { player.seekTo(maxOf(0, player.currentPosition - 10000)) }, KioskUi.weight(1f))
   controls.addView(pause, KioskUi.weight(1f))
   controls.addView(KioskUi.button(this, "Ahead 10 s", KioskUi.Style.SECONDARY) { player.seekTo(minOf(player.duration, player.currentPosition + 10000)) }, KioskUi.weight(1f))
   layout.addView(controls, KioskUi.fill())
   val dialog = Dialog(this, android.R.style.Theme_Material_NoActionBar)
   layout.addView(KioskUi.button(this, "Close video", KioskUi.Style.PRIMARY) { dialog.dismiss() }, KioskUi.fill())
   dialog.setContentView(layout)
   var dragging = false
   fun time(ms: Int): String { val seconds = maxOf(0, ms) / 1000; return String.format(Locale.US, "%02d:%02d", seconds / 60, seconds % 60) }
   val tick = object : Runnable { override fun run() {
    if (!dialog.isShowing) return
    if (!dragging) seek.progress = player.currentPosition
    clock.text = time(player.currentPosition) + " / " + time(player.duration)
    pause.text = if (player.isPlaying) "Pause" else "Play"
    main.postDelayed(this, 500)
   } }
   seek.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
    override fun onStartTrackingTouch(bar: SeekBar) { dragging = true }
    override fun onStopTrackingTouch(bar: SeekBar) { player.seekTo(bar.progress); dragging = false }
    override fun onProgressChanged(bar: SeekBar, value: Int, fromUser: Boolean) { if (fromUser) clock.text = time(value) + " / " + time(player.duration) }
   })
   player.setOnPreparedListener { seek.max = player.duration; seek.isEnabled = true; player.start() }
   player.setOnCompletionListener { pause.text = "Play" }
   player.setOnErrorListener { _, _, _ ->
    seek.isEnabled = false; controls.visibility = View.GONE
    main.removeCallbacks(tick); clock.text = "This video won't play here. Close it and use Save a copy to open it in another player."; true
   }
   dialog.setOnDismissListener { main.removeCallbacks(tick); player.stopPlayback(); if (video === player) video = null }
   dialog.show(); dialog.window?.setLayout(-1, -1)
   player.setVideoPath(file.path); main.post(tick)
   listKey = ""
  } catch (_: Exception) { Toast.makeText(this, "That video isn't available.", Toast.LENGTH_LONG).show() }
 }
 private fun export(name: String) {
  if (exportName != null) return
  try {
   val file = RearDashcamService.files(this).protect(name) // Protect before handing control to Android's picker.
   exportName = file.name
   startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
    addCategory(Intent.CATEGORY_OPENABLE); type = "video/mp4"; putExtra(Intent.EXTRA_TITLE, file.name)
   }, 62)
  } catch (_: Exception) { exportName = null; Toast.makeText(this, "Couldn't open Save a copy.", Toast.LENGTH_LONG).show() }
 }
 @Deprecated("Android activity result callback")
 override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
  super.onActivityResult(requestCode, resultCode, data)
  if (requestCode != 62) return
  val name = exportName; exportName = null
  if (resultCode != RESULT_OK || name == null || data?.data == null) return
  val uri = data.data!!
  Thread {
   val ok = try {
    val file = RearDashcamService.files(this).find(name)
    contentResolver.openOutputStream(uri, "w")!!.use { out -> file.inputStream().use { input -> input.copyTo(out) } }; true
   } catch (_: Exception) { false }
   main.post { if (!isDestroyed) Toast.makeText(this, if (ok) "Copy saved. The video stays on the tablet too." else "The copy wasn't saved. The video is still on the tablet.", Toast.LENGTH_LONG).show() }
  }.start()
 }
 override fun onSaveInstanceState(out: Bundle) { out.putString("export_name", exportName); super.onSaveInstanceState(out) }
 override fun onResume() { super.onResume(); main.post(poll) }
 override fun onPause() { main.removeCallbacks(poll); video?.pause(); super.onPause() }
 override fun onDestroy() { main.removeCallbacksAndMessages(null); video?.stopPlayback(); video = null; super.onDestroy() }
}
