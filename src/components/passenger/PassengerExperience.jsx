import { pickupArrival } from "@/lib/pickupArrival";
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Accessibility, Bell, BellOff, Building2, CalendarClock, ChevronRight, Clock, CreditCard, Home, LifeBuoy, LogOut, Map, MapPin, Megaphone, MessageCircle, PackageSearch, QrCode, ShieldCheck, TriangleAlert, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { confirmAction } from "@/components/ConfirmHost";
import CompanyBanner from "@/components/CompanyBanner";
import BusArtwork from "@/components/BusArtwork";
import BoardingPass from "@/components/staff/BoardingPass";
import RouteTimeline from "./RouteTimeline";
import { BookedRides, SponsorLine } from "./PassengerSections";
import usePassengerAccount, { usePassengerCases, usePassengerRides, usePassengerToday } from "./usePassengerAccount";
import { CaseList, CaseSheet, RequestForm, RideFeedback } from "./PassengerRequests";
import { ETA_QUALITY_TEXT, STAGES, alertKey, etaQuality, firstTime, journeyStage, stopsLeftTo } from "@/lib/journeyStage";
import { routeProgress } from "@/components/TripProgress";
import { RIDE_STATE_TEXT, TODAY_STATE_TEXT, groupRides, todayRides } from "@/lib/myRides";
import { accountName, greetingName, nameInitials } from "@/lib/userName";
import { arrivalClock, clock, lastSeen } from "./passengerState";
import { fetchDrivingRoute, haversineKm } from "@/lib/geo";
import { locationIsStale } from "@/lib/busEta";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useSupportWhatsApp } from "@/components/support/ReportAppProblem";
import { whatsappLink } from "@/lib/appSupport";
import { useStaffFlags } from "@/components/staff/QuickActions";
import { pickupMovedNote } from "@/lib/pickupOnBus";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import "./passengerExperience.css";
import "./passengerApple.css";

// Apple-style motion: a critically damped spring (no bounce) for things that
// open and close; it can be reversed mid-way without a jump.
const SPRING = { type: "spring", bounce: 0, duration: 0.4 };
// A light tap on phones that can vibrate, for choices the driver will see.
const tick = () => { try { navigator.vibrate?.(10); } catch { /* no vibration */ } };

function Portrait({ user }) {
 const [failed,setFailed]=useState(false);
 useEffect(()=>setFailed(false),[user?.photo_url]);
 return <span className="px-avatar">{user?.photo_url && !failed?<img src={user.photo_url} alt="" onError={()=>setFailed(true)} />:nameInitials(user)}</span>;
}
function Row({ icon:Icon, title, sub, to, onClick, badge }) {
 const content=<><Icon aria-hidden="true" /><span><strong>{title}</strong>{sub && <small>{sub}</small>}</span>{badge>0 && <b className="px-count">{badge}</b>}<ChevronRight aria-hidden="true" /></>;
 return to?<Link className="px-row" to={to}>{content}</Link>:<button type="button" className="px-row" onClick={onClick}>{content}</button>;
}
function useReturnEta(bus,workplace,enabled,now) {
 const [mins,setMins]=useState(null);
 const fresh=enabled && bus?.tracking_active && !locationIsStale(bus,now);
 const bucket=Math.floor(now/30000);
 useEffect(()=>{
  let alive=true;setMins(null);
  if(!fresh || workplace?.lat==null || workplace?.lng==null || ["arrived","departed"].includes(bus?.return_pickup_state)) return undefined;
  fetchDrivingRoute([{lat:bus.current_lat,lng:bus.current_lng},{lat:Number(workplace.lat),lng:Number(workplace.lng)}]).then(r=>{if(alive)setMins(r?.durationMin ?? null);}).catch(()=>{});
  return()=>{alive=false;};
  // Road ETA uses the same 30-second refresh as the previous return-trip screen.
   
 },[bus?.id,fresh,workplace?.lat,workplace?.lng,bucket,bus?.return_pickup_state]);
 return fresh?mins:null;
}
// While on board: time to the passenger's own destination, by road when the
// road service answers (a live estimate), else a rough straight-line time.
function useRideEta(bus,target,enabled,now) {
 const [road,setRoad]=useState(null);
 const bucket=Math.floor(now/30000);
 useEffect(()=>{
  let alive=true;setRoad(null);
  if(!enabled || target?.lat==null || bus?.current_lat==null) return undefined;
  fetchDrivingRoute([{lat:bus.current_lat,lng:bus.current_lng},{lat:Number(target.lat),lng:Number(target.lng)}]).then(r=>{if(alive)setRoad(r?.durationMin ?? null);}).catch(()=>{});
  return()=>{alive=false;};
 },[bus?.id,enabled,target?.lat,target?.lng,bucket]);
 if(!enabled || target?.lat==null || bus?.current_lat==null) return null;
 if(road!=null) return {mins:road,isDriving:true};
 return {mins:haversineKm(bus.current_lat,bus.current_lng,Number(target.lat),Number(target.lng))/25*60*1.3,estimated:true};
}
function JourneySteps({stage}) {
 const at=STAGES.indexOf(stage);
 return <div className="px-steps"><p className="px-steps-text">Step {at+1} of {STAGES.length}: {STAGE_LABEL[stage]}</p><ol aria-hidden="true">{STAGES.map((x,i)=><li key={x} className={i<at?"done":i===at?"now":""} />)}</ol></div>;
}
const STAGE_LABEL={scheduled:"Scheduled",approaching:"Bus coming",at_pickup:"Bus at pickup",boarded:"Boarded",onboard:"On board",near_destination:"Nearly there",exited:"Got off",completed:"Done"};
// Shown when the phone is locked or the app is in the background, if the
// passenger allowed notifications. Otherwise the alert waits for the app.
function systemAlert(title,body,tag) {
 try {
  if(typeof document==="undefined" || document.visibilityState!=="hidden" || typeof Notification==="undefined" || Notification.permission!=="granted") return;
  navigator.serviceWorker?.getRegistration?.().then(r=>r?.showNotification(title,{body,tag})).catch(()=>{});
 } catch { /* not supported */ }
}

export default function PassengerExperience({view,user,company,workplace,myVehicle,returning,tripState,pickupStop,stopsAway,timelineRoute,stopEtas,now,homeName,sharedStop,pickupPrompt,notice,chatUnread,stopAlerts,pushPermission,toggleStopAlerts,enableNotifications,setSheet,mapOpen,setMapOpen,renderMap,bookedTrips,pickupName,logout,lastSynced,offline,eta=null}) {
 const {toast}=useToast();
 const support=useSupportWhatsApp();
 const account=usePassengerAccount(user,company.id,view==="card");
 const rides=usePassengerRides(user,company.id,view==="rides");
 const [reportBusy,setReportBusy]=useState(false);
 const [showStops,setShowStops]=useState(false);
 const returnEta=useReturnEta(myVehicle,workplace,returning,now);
 const {late,skip,lateUntil,toggleLate,toggleSkip}=useStaffFlags();
 const today=usePassengerToday(user,company.id,["home","journey"].includes(view));
 const cases=usePassengerCases(user,company.id,["home","rides","more","help"].includes(view));
 const [openCase,setOpenCase]=useState(null);
 const [helpKind,setHelpKind]=useState(null);
 const [boardingNote,setBoardingNote]=useState(user?.boarding_note || "");
 const [noteOpen,setNoteOpen]=useState(false);
 const [noteSaving,setNoteSaving]=useState(false);
 const pickup=returning?workplace?.name || company.name:sharedStop?.name || homeName || pickupName;
 const dropoff=returning?homeName || pickupName:workplace?.name || company.name;
 const fresh=myVehicle?.last_location_update && !locationIsStale(myVehicle,now);
 let kind=tripState.kind,mins=tripState.mins;
 if(returning) {
  mins=returnEta;
  kind=!myVehicle?"unassigned":myVehicle.in_service===false?"problem":!myVehicle.tracking_active?"not_started":!fresh?"signal_lost":myVehicle.return_pickup_state==="arrived"?"arriving":myVehicle.return_pickup_state==="departed"?"departed":"live";
 }
 if(!fresh && ["live","arriving"].includes(kind))kind="signal_lost";
 const states={choose:"Choose your pickup",unassigned:"No bus assigned",problem:"Out of service",signal_lost:"Location delayed",arriving:"Bus approaching your stop",not_started:"Not started",no_eta:"Arrival time unavailable",departed:"Bus has left"};
 const arrival=pickupArrival({bus:myVehicle,pickup:pickupStop,mins,now,confirmedArrival:returning && myVehicle?.return_pickup_state==="arrived"});
 const atStop=["arrived","at_stop"].includes(arrival?.kind);
 // The passenger's own journey: boarding and exit only from their own taps.
 const destination=returning
  ?(user?.pickup_lat!=null?{name:homeName || pickupName || "your stop",lat:user.pickup_lat,lng:user.pickup_lng}:null)
  :(workplace?.lat!=null?{name:workplace.name || company.name,lat:Number(workplace.lat),lng:Number(workplace.lng)}:null);
 const destKm=fresh && myVehicle?.current_lat!=null && destination?haversineKm(myVehicle.current_lat,myVehicle.current_lng,destination.lat,destination.lng):null;
 const stageInfo=journeyStage({tripKind:kind,arrivalKind:arrival?.kind,taps:today.events,notTravelling:skip,destinationKm:destKm,now});
 const stage=stageInfo.stage;
 const riding=["boarded","onboard","near_destination"].includes(stage);
 const rideEta=useRideEta(myVehicle,destination,riding && !!fresh,now);
 const rideStops=riding && fresh && timelineRoute?.stops?.length?(()=>{const pts=[...timelineRoute.stops].sort((a,b)=>(a.order??0)-(b.order??0)).filter(x=>x.lat!=null && x.lng!=null);const p=pts.length>1?routeProgress(pts,myVehicle.current_lat,myVehicle.current_lng):null;return stopsLeftTo(pts,p?.nextIndex,destination);})():null;
 const status=["live","arriving"].includes(kind)?arrival?.label || states[kind] || "Bus on the way":states[kind] || "Bus on the way";
 let estimate=!atStop && kind==="live" && mins!=null?`${Math.max(1,Math.round(mins))} min`:status;
 // How far to trust the time shown, said beside it.
 const quality=riding?etaQuality({eta:rideEta,fresh:!!fresh,tracking:!!myVehicle?.tracking_active})
  :etaQuality({eta:returning?(returnEta!=null?{mins:returnEta,isDriving:true}:null):eta,fresh:myVehicle?.tracking_active?!!fresh:null,tracking:!!myVehicle?.tracking_active});
 const qualityText=ETA_QUALITY_TEXT[quality]+(quality==="last_known" && myVehicle?.last_location_update?` · ${lastSeen(myVehicle.last_location_update,now)}`:"");
 const destName=destination?.name || (returning?"your stop":"work");
 const rideMins=rideEta?.mins!=null?Math.max(1,Math.round(rideEta.mins)):null;
 const STAGE_HERO={
  boarded:{status:"Boarding confirmed",big:"On board",detail:`Recorded at ${clock(stageInfo.since)} · ${myVehicle?.name || "your bus"}`},
  onboard:{status:"On board",big:rideMins!=null?`${rideMins} min`:"On board",detail:rideMins!=null?`To ${destName}${rideStops?` · ${rideStops} stop${rideStops===1?"":"s"} to go`:""}`:`Heading to ${destName}`},
  near_destination:{status:"Almost at your stop",big:rideMins!=null?`${rideMins} min`:"Nearly there",detail:`${destName} is close. Tap your card or show your pass as you get off.`},
  exited:{status:"Exit confirmed",big:"You've arrived",detail:`Recorded at ${clock(stageInfo.since)}`},
  completed:{status:"Journey complete",big:"Done for now",detail:returning?"See you next time.":"Your ride home will show here when your bus starts."},
  not_travelling:{status:"Not travelling today",big:"Skipping today",detail:"Your driver knows. Tap Skip today again if your plans change."},
 };
 const hero=STAGE_HERO[stage];
 if(hero)estimate=hero.big;
 const live=["live","arriving"].includes(kind);
 const routeName=timelineRoute?.name || "";
 const trustedEta=live && fresh && mins!=null && Number.isFinite(mins);
 const stopCount=live && fresh?(atStop?0:!returning?stopsAway:null):null;
 const etaDetails=live?<div className="px-eta-details" aria-label="Bus arrival details">
  <span><Clock aria-hidden="true"/>{atStop?"At your pickup stop":trustedEta?`Estimated pickup ${arrivalClock(mins,now)}`:"Estimated pickup unavailable"}</span>
  <span><MapPin aria-hidden="true"/>{stopCount==null?(returning?"Heading to your company pickup":"Heading to your pickup"):stopCount===0?(atStop?(arrival?.kind==="arrived"?"Ready for boarding":"At your stop"):"Your stop is next"):`${stopCount} stop${stopCount===1?"":"s"} away`}</span>
 </div>:null;

 // Journey alerts: once per passenger, per ride (or the wait before it), per
 // event, so two rides on the same bus in a day each get their own. They show
 // in the app; with the phone locked, only if notifications are allowed.
 const nearKind=!returning && !riding && live && fresh && ["nearby","at_stop","arrived"].includes(arrival?.kind)?arrival.kind:null;
 const alertCtx={busId:myVehicle?.id || "",date:new Date(now).toLocaleDateString("en-CA",{timeZone:"America/Grenada"}),direction:returning?"to_home":"to_work"};
 const busName=myVehicle?.name || "Your bus";
 const alertEvent=stage==="boarded"?["boarded","Boarding confirmed",`Recorded on ${busName} at ${clock(stageInfo.since)}.`]
  :stage==="near_destination"?["near_destination",`Almost at ${destName}`,"Get ready. Tap your card or show your pass as you get off."]
  :stage==="exited"?["exited","Exit confirmed",`Recorded at ${clock(stageInfo.since)}.`]
  :stage==="out_of_service"?["out_of_service",`${busName} is out of service`,"Your transport team will update you. Message them if you need help."]
  :nearKind==="nearby"?["pickup_near","Your bus is close",`${busName} is almost at your pickup. Head there now.`]
  :nearKind?["pickup_here","Your bus is at your stop","Meet the bus at your pickup point."]:null;
 const alertId=alertEvent?alertKey(user?.id,stageInfo,alertEvent[0],alertCtx):"";
 useEffect(()=>{
  if(!alertEvent || !today.known && ["boarded","near_destination","exited"].includes(alertEvent[0]))return;
  if(!firstTime(alertId))return;
  toast({title:alertEvent[1],description:alertEvent[2]});
  try { navigator.vibrate?.([250,120,250]); } catch { /* no vibration */ }
  systemAlert(alertEvent[1],alertEvent[2],alertId);
 },[alertId]);
 // The bus or pickup changed since this phone last looked.
 const pickupNow=returning?"":pickup || "";
 useEffect(()=>{
  if(!user?.id)return;
  const key=`tt_last_assignment_${user.id}`;
  let before=null;
  try { before=JSON.parse(localStorage.getItem(key) || "null"); } catch { /* none */ }
  const nowSeen={bus:myVehicle?.id || "",busName:myVehicle?.name || "",pickup:pickupNow};
  try { localStorage.setItem(key,JSON.stringify(nowSeen)); } catch { /* storage blocked */ }
  if(!before)return;
  if(before.bus && nowSeen.bus && before.bus!==nowSeen.bus) { toast({title:"Your bus has changed",description:`You now ride ${nowSeen.busName || "a different bus"}.`}); systemAlert("Your bus has changed",`You now ride ${nowSeen.busName || "a different bus"}.`,key+":bus"); }
  else if(before.pickup && nowSeen.pickup && before.pickup!==nowSeen.pickup && before.bus===nowSeen.bus) toast({title:"Your pickup has changed",description:`Meet the bus at ${nowSeen.pickup}.`});
 },[user?.id,myVehicle?.id,pickupNow]);
 // A booked ride confirmed, moved or cancelled by the office.
 const bookingSig=(bookedTrips || []).map(t=>`${t.id}:${t.status}:${t.scheduled_time || ""}`).join("|");
 useEffect(()=>{
  if(!user?.id)return;
  const key=`tt_last_bookings_${user.id}`;
  let before=null;
  try { before=localStorage.getItem(key); localStorage.setItem(key,bookingSig); } catch { /* storage blocked */ }
  if(before!=null && before!==bookingSig && bookingSig) toast({title:"Your booked rides changed",description:"Check the time and pickup under My journey."});
 },[user?.id,bookingSig]);

 const reportMissed=async()=>{
  if(reportBusy || !(await confirmAction({title:"Report a missed pickup?",description:"Your bus team and the office get a message about this journey, with a reference number.",confirmLabel:"Send report"})))return;
  setReportBusy(true);
  try {
   const res=await cases.send({action:"create",kind:"missed_pickup",details:`I missed my pickup${pickup?` at ${pickup}`:""}.`});
   toast({title:"Missed pickup reported",description:`Reference ${res.case.reference}. Your bus team can see your message.`});setSheet("chat");
  } catch(e){toast({title:"Couldn't send the report",description:e?.response?.data?.error || e?.data?.error || e.message,variant:"destructive"});}
  finally{setReportBusy(false);}
 };
 const lostCard=async()=>{
  if(!(await confirmAction({title:"Report your NFC card lost?",description:"Your issued NFC card will stop working. Your personal QR remains available while your transport team arranges a replacement.",confirmLabel:"Disable card and report"})))return;
  try{await account.reportLost();toast({title:"Card disabled",description:"Your transport team has the replacement request."});}
  catch(e){toast({title:"Couldn't report the card",description:e.message,variant:"destructive"});}
 };
 // Neighbours' pickups along the road share one stop: say where to meet.
 const shareNote=!returning && sharedStop && (sharedStop.shared_with>0 || sharedStop.moved_m>15)
  ? (sharedStop.moved_m>15 ? `Meet at ${sharedStop.name}, ${sharedStop.moved_m} m from your spot` : `Meet at ${sharedStop.name}`)
   +(sharedStop.shared_with>0 ? ` · shared with ${sharedStop.shared_with} other${sharedStop.shared_with===1?"":"s"}` : "")
  : null;
 // Only while the pinned roadside spot is the pickup in use, not a company stop.
 const movedNote=!returning && (sharedStop || pickup===user?.pickup_name) ? pickupMovedNote(user,now) : null;
 // No roadside pickup pinned yet: offer to find one near home.
 const findPickup=!returning && user?.pickup_lat==null && <section className="px-panel px-find-pickup" aria-labelledby="px-find-pickup">
  <MapPin aria-hidden="true" /><div><h2 id="px-find-pickup">Get picked up near home</h2><p>Find a roadside pickup on a road your bus uses, with walking directions.</p></div>
  <button type="button" className="px-find-btn" onClick={()=>setSheet("pickup")}>Find my pickup</button>
 </section>;
 const journeyPanel=<section className="px-panel px-journey-points" aria-label="Pickup and drop-off">
  <div><MapPin /><span><small>PICKUP</small><strong>{pickup || "Choose your home pickup"}</strong><p>{returning?"Company boarding point":shareNote || "Your saved pickup spot"}</p>{movedNote && <p className="px-pickup-note">{movedNote}</p>}</span></div>
  <div><MapPin /><span><small>DROP-OFF</small><strong>{dropoff || "Home stop not set"}</strong><p>{returning?"Your home stop":"Company address"}</p></span><Button size="sm" variant="outline" onClick={()=>setSheet("pickup")}>Change</Button></div>
 </section>;
 const alertPanel=<section className="px-panel px-alert-setting">
  <Bell /><span><strong>Pickup alerts</strong><small>{pushPermission==="granted" && stopAlerts?"On. With the app closed or the phone locked, only pickup alerts reach you; the rest show when you open the app.":"Get notified when your bus is nearby"}</small></span>
  <Switch aria-label="Pickup alerts" checked={stopAlerts && pushPermission==="granted"} onCheckedChange={toggleStopAlerts} />
  {stopAlerts && pushPermission!=="granted" && <Button size="sm" variant="outline" onClick={enableNotifications}>Retry notifications</Button>}
 </section>;
 // The driver sees both on the bus tablet and the driver phone. Each turns
 // itself off: running late after a few hours, skip today at midnight.
 const flagsPanel=<div className="px-flags" role="group" aria-label="Tell your driver">
  <button type="button" aria-pressed={late} onClick={()=>{tick();toggleLate();}}><Clock aria-hidden="true" /><span><strong>{late?"Running late":"I'm running late"}</strong>{late && lateUntil && <small>Until {clock(lateUntil)}</small>}</span></button>
  <button type="button" aria-pressed={skip} onClick={()=>{tick();toggleSkip();}}><BellOff aria-hidden="true" /><span><strong>{skip?"Skipping today":"Skip today"}</strong>{skip && <small>Back on tomorrow</small>}</span></button>
 </div>;
 // reducedMotion="user": with the phone's reduce-motion setting on, the
 // springs below become fades.
 return <MotionConfig reducedMotion="user"><div className="px-experience">
  {view==="home" && <>
   <header className="px-top"><p>McSween <span>Transport</span></p><div><Link to="/notifications" aria-label="Messages and announcements"><Bell /></Link><Link to="/account" aria-label="Account"><Portrait user={user} /></Link></div></header>
   <CompanyBanner name={company.name} logoUrl={company.logo_url} compact />
   <h1 className="px-greeting">{new Date(now).getHours()<12?"Good morning":new Date(now).getHours()<18?"Good afternoon":"Good evening"}{greetingName(user)?`, ${greetingName(user)}`:""}</h1>
   <p className="px-direction">YOUR JOURNEY · {returning?"TO HOME":"TO WORK"}</p>
   {notice && <Link className="px-notice" to="/notifications"><Megaphone /><span><strong>{notice.title || "Company update"}</strong><small>{notice.message}</small></span><ChevronRight /></Link>}
   <section className="px-hero" aria-label="Your next bus">
    <div className="px-hero-copy"><p role="status" aria-live="polite" className={live || riding?"px-service live":"px-service"}><span />{hero?hero.status:status}</p><h2>{estimate}</h2><p>{hero?hero.detail:live?(arrival?.detail || `Until pickup ${returning?"at work":"near home"}`):kind==="unassigned"?"Your company assigns your bus":kind==="signal_lost"?"Waiting for a fresh location":kind==="choose"?"Choose a stop to see your ETA":"Your next trip will appear here"}</p>{myVehicle && !["exited","completed","not_travelling"].includes(stage) && <small className={`px-eta-quality ${quality}`}>{qualityText}</small>}<strong>{myVehicle?.name || "No bus assigned"}{routeName?` · ${routeName}`:""}</strong></div>
    {myVehicle && <BusArtwork vehicle={myVehicle} fallbackUrl="/images/boarding-coaster.webp" className="px-hero-bus" width={260} />}
    {!riding && etaDetails}
    {STAGES.includes(stage) && <JourneySteps stage={stage} />}
   </section>
   {["exited","completed"].includes(stage) && <RideFeedback rideId={stageInfo.rideId} send={cases.send} sending={cases.sending} />}
   {pickupPrompt}
   {findPickup}
   {journeyPanel}
   {flagsPanel}
   {alertPanel}
   <div className="px-quick"><Link to="/journey"><Map />View journey</Link><Link to="/my-card"><QrCode />Boarding pass</Link></div>
   <button className="px-message" onClick={()=>setSheet("chat")}><MessageCircle />Need anything? Message us{chatUnread>0 && <b className="px-count">{chatUnread}</b>}<ChevronRight /></button>
   <SponsorLine />
  </>}
  {view==="journey" && <>
   <header className="px-page-title"><h1>My journey</h1><p>{returning?"To home":"To work"} · Today</p></header>
   <section className="px-panel px-bus-identity"><BusArtwork vehicle={myVehicle} className="h-24 w-28" /><div><h2>{myVehicle?.name || "No bus assigned"}</h2><p>{routeName || "Your company transport"}</p><span className={live?"px-status active":"px-status"}>{status}</span><small>{myVehicle?.last_location_update?`Updated ${lastSeen(myVehicle.last_location_update,now)}`:"Waiting for a bus update"}</small></div></section>
   <section className="px-panel px-map-action"><h2><Clock />{estimate}{!atStop && kind==="live" && mins!=null?" away":""}</h2>{etaDetails}<Button variant="outline" className="w-full" onClick={()=>setMapOpen(!mapOpen)} aria-expanded={mapOpen}><Map />{mapOpen?"Hide live map":"View live map"}</Button></section>
   <AnimatePresence initial={false}>{mapOpen && <motion.section key="map" className="px-map-view" aria-label="Live journey map" initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={SPRING}>{renderMap()}</motion.section>}</AnimatePresence>
   <section className="px-panel"><h2>Your trip today</h2>{journeyPanel}{trustedEta && !atStop && <p className="px-trip-time">Estimated pickup {arrivalClock(mins,now)}</p>}</section>
   <section className="px-panel px-wait"><MapPin /><div><h2>Where to wait</h2><p>{returning?`Meet the bus at ${workplace?.name || "your company boarding point"}.`:pickup?`Meet the bus at ${pickup}.`:"Choose a safe roadside pickup on your bus route."}</p>{!returning && pickupStop?.note && <p className="px-pickup-note">{pickupStop.note}</p>}<Button variant="outline" onClick={()=>setSheet("pickup")}>Walking directions</Button></div></section>
   {pickupPrompt}
   {timelineRoute && <><button className="px-message" aria-expanded={showStops} onClick={()=>setShowStops(!showStops)}><Map />{showStops?"Hide route stops":"All route stops"}<ChevronRight /></button><AnimatePresence initial={false}>{showStops && <motion.div key="stops" className="px-unfold" initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} transition={SPRING}><RouteTimeline route={returning?{...timelineRoute,stops:[...(timelineRoute.stops || [])].reverse().map((s,order)=>({...s,order}))}:timelineRoute} bus={myVehicle} kind={kind} stopName={pickup} mins={mins} stopEtas={returning?{}:stopEtas} now={now} /></motion.div>}</AnimatePresence></>}
   <div className="px-panel px-settings-list"><Row icon={MessageCircle} title="Need help with this trip?" sub="Message your bus team" onClick={()=>setSheet("chat")} badge={chatUnread}/><Row icon={TriangleAlert} title={reportBusy?"Sending report…":"Report missed pickup"} onClick={reportMissed}/></div>
   <BookedRides trips={bookedTrips} stopName={pickupName} />
   <Link to="/buses" className="px-quiet-link">Browse company buses</Link>
  </>}
  {view==="card" && <>
   <header className="px-page-title"><h1>My pass</h1></header>
   <section className="px-digital-card"><div className="px-card-person"><div><p>{company.name}</p><h2>{accountName(user)}</h2><span className="px-role">{user.role==="staff"?"HOTEL STAFF":"PASSENGER"}</span>{user.employee_id && <small>{user.employee_id}</small>}</div><Portrait user={user}/></div><BoardingPass digital /></section>
   <section className="px-panel"><h2><CreditCard />NFC card</h2>{account.loading?<p role="status">Checking your issued card…</p>:account.error?<><p role="alert">{account.error}</p><Button onClick={()=>account.retry()} variant="outline">Retry card details</Button></>:<><p className={account.summary?.card?.active?"px-positive":""}>{account.summary?.card?.issued?"Issued · ":""}{account.summary?.card?.status || "Not issued"}</p><p>{account.summary?.card?.active?"Tap your card on the boarding tablet.":"Your transport team can issue or replace your card."}</p><Button disabled={!account.summary?.card?.active || account.reporting} variant="outline" className="w-full" onClick={lostCard}><TriangleAlert />Report lost card</Button></>}</section>
   <div className="px-panel px-settings-list"><Row icon={CalendarClock} title="My rides" sub="Today's rides and your boarding history" to="/rides"/></div>
  </>}
  {view==="rides" && <>
   <header className="px-page-title"><h1>My rides</h1><p>Your regular transport and the rides you've taken</p></header>
   <section className="px-panel" aria-labelledby="px-rides-today"><h2 id="px-rides-today"><CalendarClock />Today</h2>
    <ul className="px-ride-list">{todayRides({bus:myVehicle,pickup:homeName || pickupName,destination:workplace?.name || company.name,returning,skip,late,lateUntil}).map(r=><li key={r.key} aria-current={r.current?"step":undefined}><span><strong>{r.label}{r.current?" · next":""}</strong><small>{r.from || "Your pickup"} to {r.to || "your destination"}{r.bus?` · ${r.bus}`:""}</small></span><b className={`px-ride-state ${r.state}`}>{TODAY_STATE_TEXT[r.state]}{r.lateUntil?` until ${clock(r.lateUntil)}`:""}</b></li>)}</ul>
    {flagsPanel}
    <p className="px-ride-note">No booking needed: your rides follow your company's schedule. Tell your driver here if you're not travelling or running late.</p>
   </section>
   <section className="px-panel" aria-labelledby="px-rides-change"><h2 id="px-rides-change"><Clock />Change a ride</h2>
    <p>Ask for a different time or pickup on one day, or say you won't need the bus on a later day. The office confirms or tells you why not.</p>
    <RequestForm kinds={["time_change","pickup_change","cancel_ride"]} send={cases.send} sending={cases.sending} bookedTrips={bookedTrips} onSent={setOpenCase} />
   </section>
   <section className="px-panel px-settings-list" aria-labelledby="px-rides-requests"><h2 id="px-rides-requests" className="px-list-title">My requests{cases.unread>0 && <b className="px-count">{cases.unread}</b>}</h2>
    <CaseList cases={cases.cases} loading={cases.loading} error={cases.error} retry={cases.retry} onOpen={setOpenCase} empty="No requests yet." />
   </section>
   <section className="px-panel" aria-labelledby="px-rides-done"><h2 id="px-rides-done"><Clock />Completed</h2>
    {rides.loading?<p role="status">Loading your rides…</p>:rides.error?<><p role="alert">{rides.error}</p><Button variant="outline" onClick={()=>rides.retry()}>Try again</Button></>:(()=>{const list=groupRides(rides.events);return list.length?<ul className="px-history">{list.map(r=><li key={r.id}><span className="px-history-dot"/><span><strong>{r.bus}</strong><small>{new Date(r.boardedAt || r.exitedAt).toLocaleDateString([], {weekday:"short",day:"numeric",month:"short"})} · {r.boardedAt?clock(r.boardedAt):"—"}{r.exitedAt?` to ${clock(r.exitedAt)}`:""} · {RIDE_STATE_TEXT[r.state]}</small></span></li>)}</ul>:<p>No rides in the last 60 days. Rides appear here after you tap your card or show your pass on the bus.</p>;})()}
   </section>
  </>}
  {view==="help" && <>
   <header className="px-page-title"><h1>Help</h1><p>Report a problem, or follow up something you sent</p></header>
   <section className="px-panel px-settings-list" aria-label="Get help">
    <Row icon={TriangleAlert} title="Missed pickup" sub="Tell your bus team and the office" onClick={()=>setHelpKind("missed_pickup")}/>
    <Row icon={CreditCard} title="Card problem" sub="Not working, damaged or not received" onClick={()=>setHelpKind("card_issue")}/>
    <Row icon={CalendarClock} title="Booking problem" sub="A booked ride that is wrong or missing" onClick={()=>setHelpKind("booking_issue")}/>
    <Row icon={PackageSearch} title="Lost item" sub="Something you left on the bus" onClick={()=>setSheet("help")}/>
    <Row icon={LifeBuoy} title="Something else" onClick={()=>setHelpKind("other")}/>
   </section>
   {helpKind && <section className="px-panel" aria-labelledby="px-help-form"><h2 id="px-help-form">{({missed_pickup:"Missed pickup",card_issue:"Card problem",booking_issue:"Booking problem",other:"Something else"})[helpKind]}</h2>
    <RequestForm key={helpKind} kinds={[helpKind]} send={cases.send} sending={cases.sending} onSent={(c)=>{setHelpKind(null);setOpenCase(c);}} />
    <Button variant="ghost" className="w-full" onClick={()=>setHelpKind(null)}>Cancel</Button>
   </section>}
   <section className="px-panel px-settings-list" aria-labelledby="px-help-mine"><h2 id="px-help-mine" className="px-list-title">My requests{cases.unread>0 && <b className="px-count">{cases.unread}</b>}</h2>
    <CaseList cases={cases.cases} loading={cases.loading} error={cases.error} retry={cases.retry} onOpen={setOpenCase} empty="Nothing sent yet. Problems and requests you send appear here with a reference number." />
   </section>
   <section className="px-panel px-settings-list">
    <Row icon={MessageCircle} title="Message your bus team" sub="Your driver and the staff on your bus" badge={chatUnread} onClick={()=>setSheet("chat")}/>
    <Row icon={ShieldCheck} title="Safety standards" to="/safety-standards"/>
    {support && <a className="px-row" href={whatsappLink(support,"passenger app")} target="_blank" rel="noopener noreferrer"><LifeBuoy /><span><strong>Report an app problem</strong></span><ChevronRight /></a>}
   </section>
  </>}
  {view==="more" && <>
   <header className="px-page-title"><h1>Your account</h1></header>
   <Link to="/account" className="px-panel px-profile"><Portrait user={user}/><span><strong>{accountName(user)}</strong><small>{user.role==="staff"?"Hotel staff":"Passenger"}</small><b>Edit profile</b></span><ChevronRight /></Link>
   <section className="px-panel px-settings-list">
    <Row icon={Home} title="My home pickup spot" sub={homeName || pickupName || "Choose your pickup"} onClick={()=>setSheet("pickup")}/>
    <Row icon={Building2} title="Company" sub={company.name} onClick={()=>setSheet("notifications")}/>
    <Row icon={Bell} title="Notifications" sub={pushPermission==="granted"?"Enabled on this phone":"Tap to set up alerts"} onClick={()=>setSheet("notifications")}/>
    <Row icon={MessageCircle} title="Messages" sub="Your driver and bus team" badge={chatUnread} onClick={()=>setSheet("chat")}/>
    <Row icon={Megaphone} title="Company announcements" sub="Service updates" to="/notifications"/>
    <Row icon={LifeBuoy} title="Help & support" sub="Problems, requests and replies" to="/help" badge={cases.unread}/>
    <Row icon={Accessibility} title="Boarding help" sub={user?.boarding_note?"Your driver can see your note":"Tell your driver if you need help getting on"} onClick={()=>setNoteOpen(o=>!o)}/>
   </section>
   {noteOpen && <section className="px-panel" aria-labelledby="px-boarding-note">
    <h2 id="px-boarding-note"><Accessibility />Boarding help</h2>
    <p>For example: a lower step, more time to sit down, or help with a bag. Your driver sees this note.</p>
    <label className="px-field"><span>Your note</span><textarea rows={3} maxLength={300} value={boardingNote} onChange={e=>setBoardingNote(e.target.value)} /></label>
    <p className="px-ride-note">This doesn't guarantee a particular vehicle. If you need a wheelchair-accessible bus, message your transport team so they can confirm one.</p>
    <Button className="w-full" disabled={noteSaving || boardingNote===(user?.boarding_note || "")} onClick={async()=>{setNoteSaving(true);try{await base44.auth.updateMe({boarding_note:boardingNote.trim()});toast({title:"Boarding note saved"});setNoteOpen(false);}catch(e){toast({title:"Couldn't save your note",description:e?.response?.data?.error || e.message,variant:"destructive"});}finally{setNoteSaving(false);}}}>{noteSaving?"Saving…":"Save note"}</Button>
   </section>}
   <section className="px-panel px-offline"><Wifi /><span><strong>Offline access</strong><p>{offline?"Showing saved trip details.":"Your last received trip details stay available."}</p><small>{lastSynced?`Last synced ${clock(lastSynced)}`:"Waiting for the first sync"}</small></span></section>
   <details className="px-panel"><summary>More tools</summary><div className="px-settings-list"><Row icon={ShieldCheck} title="Safety standards" to="/safety-standards"/>{support && <a className="px-row" href={whatsappLink(support,"passenger app")} target="_blank" rel="noopener noreferrer"><LifeBuoy /><span>Report an app problem</span><ChevronRight /></a>}</div></details>
   <button className="px-sign-out" onClick={logout}><LogOut />Sign out</button>
  </>}
  <CaseSheet item={openCase && (cases.cases.find(c=>c.id===openCase.id) || openCase)} onClose={()=>setOpenCase(null)} send={cases.send} sending={cases.sending} />
  {view==="journey" && !mapOpen && <button className="px-floating-chat" aria-label="Open passenger chat" onClick={()=>setSheet("chat")}><MessageCircle /></button>}
 </div></MotionConfig>;
}
