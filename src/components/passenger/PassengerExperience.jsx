import { pickupArrival } from "@/lib/pickupArrival";
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Building2, Bus, ChevronRight, Clock, CreditCard, Home, LifeBuoy, LogOut, Map, MapPin, Megaphone, MessageCircle, QrCode, ShieldCheck, Sparkles, TriangleAlert, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { confirmAction } from "@/components/ConfirmHost";
import CompanyBanner from "@/components/CompanyBanner";
import BusArtwork from "@/components/BusArtwork";
import BoardingPass from "@/components/staff/BoardingPass";
import RouteTimeline from "./RouteTimeline";
import { BookedRides, SponsorLine } from "./PassengerSections";
import usePassengerAccount from "./usePassengerAccount";
import { accountName, greetingName, nameInitials } from "@/lib/userName";
import { arrivalClock, clock, lastSeen } from "./passengerState";
import { fetchDrivingRoute } from "@/lib/geo";
import { locationIsStale } from "@/lib/busEta";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useSupportWhatsApp } from "@/components/support/ReportAppProblem";
import { whatsappLink } from "@/lib/appSupport";
import "./passengerExperience.css";

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
export default function PassengerExperience({view,user,company,workplace,myVehicle,returning,tripState,pickupStop,stopsAway,timelineRoute,stopEtas,now,homeName,sharedStop,pickupPrompt,notice,chatUnread,stopAlerts,pushPermission,toggleStopAlerts,enableNotifications,setSheet,mapOpen,setMapOpen,renderMap,bookedTrips,pickupName,logout,lastSynced,offline}) {
 const {toast}=useToast();
 const support=useSupportWhatsApp();
 const account=usePassengerAccount(user,company.id,view==="card");
 const [reportBusy,setReportBusy]=useState(false);
 const [showStops,setShowStops]=useState(false);
 const returnEta=useReturnEta(myVehicle,workplace,returning,now);
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
 const status=["live","arriving"].includes(kind)?arrival?.label || states[kind] || "Bus on the way":states[kind] || "Bus on the way";
 const estimate=!atStop && kind==="live" && mins!=null?`${Math.max(1,Math.round(mins))} min`:status;
 const live=["live","arriving"].includes(kind);
 const routeName=timelineRoute?.name || "";
 const trustedEta=live && fresh && mins!=null && Number.isFinite(mins);
 const stopCount=live && fresh?(atStop?0:!returning?stopsAway:null):null;
 const etaDetails=live?<div className="px-eta-details" aria-label="Bus arrival details">
  <span><Clock aria-hidden="true"/>{atStop?"At your pickup stop":trustedEta?`Estimated pickup ${arrivalClock(mins,now)}`:"Estimated pickup unavailable"}</span>
  <span><MapPin aria-hidden="true"/>{stopCount==null?(returning?"Heading to your company pickup":"Heading to your pickup"):stopCount===0?(atStop?(arrival?.kind==="arrived"?"Ready for boarding":"At your stop"):"Your stop is next"):`${stopCount} stop${stopCount===1?"":"s"} away`}</span>
 </div>:null;

 const reportMissed=async()=>{
  if(reportBusy || !(await confirmAction({title:"Report a missed pickup?",description:"Send your bus team a message asking for help with this journey.",confirmLabel:"Send report"})))return;
  setReportBusy(true);
  try {
   const {data}=await base44.functions.invoke("passengerAccount",{action:"report_missed_pickup"});
   if(data.message_id) base44.functions.invoke("notifyAdminMessage",{message_id:data.message_id}).catch(()=>{});
   toast({title:"Missed pickup reported",description:"Your bus team can see your message."});setSheet("chat");
  } catch(e){toast({title:"Couldn't send the report",description:e?.data?.error || e.message,variant:"destructive"});}
  finally{setReportBusy(false);}
 };
 const lostCard=async()=>{
  if(!(await confirmAction({title:"Report your NFC card lost?",description:"Your issued NFC card will stop working. Your personal QR remains available while your transport team arranges a replacement.",confirmLabel:"Disable card and report"})))return;
  try{await account.reportLost();toast({title:"Card disabled",description:"Your transport team has the replacement request."});}
  catch(e){toast({title:"Couldn't report the card",description:e.message,variant:"destructive"});}
 };
 const journeyPanel=<section className="px-panel px-journey-points" aria-label="Pickup and drop-off">
  <div><MapPin /><span><small>PICKUP</small><strong>{pickup || "Choose your home pickup"}</strong><p>{returning?"Company boarding point":sharedStop?.shared_with>0?`Shared roadside stop · ${sharedStop.shared_with} others`:"Your saved pickup spot"}</p></span></div>
  <div><MapPin /><span><small>DROP-OFF</small><strong>{dropoff || "Home stop not set"}</strong><p>{returning?"Your home stop":"Company address"}</p></span><Button size="sm" variant="outline" onClick={()=>setSheet("pickup")}>Change</Button></div>
 </section>;
 const alertPanel=<section className="px-panel px-alert-setting">
  <Bell /><span><strong>Pickup alerts</strong><small>{pushPermission==="granted" && stopAlerts?"Notifications enabled":"Get notified when your bus is nearby"}</small></span>
  <Switch aria-label="Pickup alerts" checked={stopAlerts && pushPermission==="granted"} onCheckedChange={toggleStopAlerts} />
  {stopAlerts && pushPermission!=="granted" && <Button size="sm" variant="outline" onClick={enableNotifications}>Retry notifications</Button>}
 </section>;
 return <div className="px-experience">
  {view==="home" && <>
   <header className="px-top"><p>Transit<span>Track</span></p><div><Link to="/notifications" aria-label="Messages and announcements"><Bell /></Link><Link to="/account" aria-label="Account"><Portrait user={user} /></Link></div></header>
   <CompanyBanner name={company.name} logoUrl={company.logo_url} compact />
   <h1 className="px-greeting">{new Date(now).getHours()<12?"Good morning":new Date(now).getHours()<18?"Good afternoon":"Good evening"}{greetingName(user)?`, ${greetingName(user)}`:""}</h1>
   <p className="px-direction">YOUR JOURNEY · {returning?"TO HOME":"TO WORK"}</p>
   {notice && <Link className="px-notice" to="/notifications"><Megaphone /><span><strong>{notice.title || "Company update"}</strong><small>{notice.message}</small></span><ChevronRight /></Link>}
   <section className="px-hero" aria-label="Your next bus">
    <div className="px-hero-copy"><p role="status" aria-live="polite" className={live?"px-service live":"px-service"}><span />{status}</p><h2>{estimate}</h2><p>{live?(arrival?.detail || `Until pickup ${returning?"at work":"near home"}`):kind==="unassigned"?"Your company assigns your bus":kind==="signal_lost"?"Waiting for a fresh location":kind==="choose"?"Choose a stop to see your ETA":"Your next trip will appear here"}</p><strong>{myVehicle?.name || "No bus assigned"}{routeName?` · ${routeName}`:""}</strong></div>
    {myVehicle && <BusArtwork vehicle={myVehicle} fallbackUrl="/images/boarding-coaster.webp" className="px-hero-bus" width={260} />}
    {etaDetails}
   </section>
   {pickupPrompt}
   {journeyPanel}
   {alertPanel}
   <div className="px-quick"><Link to="/journey"><Map />View journey</Link><Link to="/my-card"><QrCode />Boarding pass</Link></div>
   <button className="px-message" onClick={()=>setSheet("chat")}><MessageCircle />Need anything? Message us{chatUnread>0 && <b className="px-count">{chatUnread}</b>}<ChevronRight /></button>
   <SponsorLine />
  </>}
  {view==="journey" && <>
   <header className="px-page-title"><h1>My journey</h1><p>{returning?"To home":"To work"} · Today</p></header>
   <section className="px-panel px-bus-identity"><BusArtwork vehicle={myVehicle} className="h-24 w-28" /><div><h2>{myVehicle?.name || "No bus assigned"}</h2><p>{routeName || "Your company transport"}</p><span className={live?"px-status active":"px-status"}>{status}</span><small>{myVehicle?.last_location_update?`Updated ${lastSeen(myVehicle.last_location_update,now)}`:"Waiting for a bus update"}</small></div></section>
   <section className="px-panel px-map-action"><h2><Clock />{estimate}{!atStop && kind==="live" && mins!=null?" away":""}</h2>{etaDetails}<Button variant="outline" className="w-full" onClick={()=>setMapOpen(!mapOpen)} aria-expanded={mapOpen}><Map />{mapOpen?"Hide live map":"View live map"}</Button></section>
   {mapOpen && <section className="px-map-view" aria-label="Live journey map">{renderMap()}</section>}
   <section className="px-panel"><h2>Your trip today</h2>{journeyPanel}{trustedEta && !atStop && <p className="px-trip-time">Estimated pickup {arrivalClock(mins,now)}</p>}</section>
   <section className="px-panel px-wait"><MapPin /><div><h2>Where to wait</h2><p>{returning?`Meet the bus at ${workplace?.name || "your company boarding point"}.`:pickup?`Meet the bus at ${pickup}.`:"Choose a safe roadside pickup on your bus route."}</p><Button variant="outline" onClick={()=>setSheet("pickup")}>Walking directions</Button></div></section>
   {pickupPrompt}
   {timelineRoute && <><button className="px-message" aria-expanded={showStops} onClick={()=>setShowStops(!showStops)}><Map />{showStops?"Hide route stops":"All route stops"}<ChevronRight /></button>{showStops && <RouteTimeline route={returning?{...timelineRoute,stops:[...(timelineRoute.stops || [])].reverse().map((s,order)=>({...s,order}))}:timelineRoute} bus={myVehicle} kind={kind} stopName={pickup} mins={mins} stopEtas={returning?{}:stopEtas} now={now} />}</>}
   <div className="px-panel px-settings-list"><Row icon={MessageCircle} title="Need help with this trip?" sub="Message your bus team" onClick={()=>setSheet("chat")} badge={chatUnread}/><Row icon={TriangleAlert} title={reportBusy?"Sending report…":"Report missed pickup"} onClick={reportMissed}/></div>
   <BookedRides trips={bookedTrips} stopName={pickupName} />
   <Link to="/buses" className="px-quiet-link">Browse company buses</Link>
  </>}
  {view==="card" && <>
   <header className="px-page-title"><h1>My boarding card</h1></header>
   <section className="px-digital-card"><div className="px-card-person"><div><p>{company.name}</p><h2>{accountName(user)}</h2><span className="px-role">{user.role==="staff"?"HOTEL STAFF":"PASSENGER"}</span>{user.employee_id && <small>{user.employee_id}</small>}</div><Portrait user={user}/></div><BoardingPass digital /></section>
   <section className="px-panel"><h2><CreditCard />NFC card</h2>{account.loading?<p role="status">Checking your issued card…</p>:account.error?<><p role="alert">{account.error}</p><Button onClick={()=>account.retry()} variant="outline">Retry card details</Button></>:<><p className={account.summary?.card?.active?"px-positive":""}>{account.summary?.card?.issued?"Issued · ":""}{account.summary?.card?.status || "Not issued"}</p><p>{account.summary?.card?.active?"Tap your card on the boarding tablet.":"Your transport team can issue or replace your card."}</p><Button disabled={!account.summary?.card?.active || account.reporting} variant="outline" className="w-full" onClick={lostCard}><TriangleAlert />Report lost card</Button></>}</section>
   <section className="px-panel"><h2><Clock />Recent journeys</h2>{account.summary?.history?.length?<ul className="px-history">{account.summary.history.map(row=><li key={row.id}><span className="px-history-dot"/><span><strong>{row.vehicle_name}</strong><small>{row.status==="boarded"?"Boarded":"Exited"} · {new Date(row.boarded_at).toLocaleDateString()} · {clock(row.boarded_at)}</small></span></li>)}</ul>:<p>{account.loading?"Loading your boarding history…":"No boarding history yet."}</p>}</section>
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
    <Row icon={LifeBuoy} title="Help & support" onClick={()=>setSheet("help")}/>
   </section>
   <section className="px-panel px-offline"><Wifi /><span><strong>Offline access</strong><p>{offline?"Showing saved trip details.":"Your last received trip details stay available."}</p><small>{lastSynced?`Last synced ${clock(lastSynced)}`:"Waiting for the first sync"}</small></span></section>
   <details className="px-panel"><summary>More tools</summary><div className="px-settings-list"><Row icon={Sparkles} title="Ask about your bus" onClick={()=>setSheet("assistant")}/><Row icon={ShieldCheck} title="Safety standards" to="/safety-standards"/><Row icon={Bus} title="Booked rides" to="/passenger-bookings"/>{support && <a className="px-row" href={whatsappLink(support,"passenger app")} target="_blank" rel="noopener noreferrer"><LifeBuoy /><span>Report an app problem</span><ChevronRight /></a>}</div></details>
   <button className="px-sign-out" onClick={logout}><LogOut />Sign out</button>
  </>}
  {view==="journey" && !mapOpen && <button className="px-floating-chat" aria-label="Open passenger chat" onClick={()=>setSheet("chat")}><MessageCircle /></button>}
 </div>;
}
