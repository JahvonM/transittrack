import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
export const nativePushPlatform=()=>Capacitor.isNativePlatform()?Capacitor.getPlatform():null;
const nativePushReady=()=>["android","ios"].includes(nativePushPlatform());
// This backend sends through Firebase (FCM). Android hands the app an FCM
// token directly; the iPhone app's AppDelegate swaps Apple's APNs token for
// an FCM one. A raw APNs token (64 hex characters) means that swap isn't in
// this build: never save it or report notifications as working.
export const looksLikeApnsToken=(token)=>/^[0-9a-f]{64}$/i.test(String(token||""));
let registration=null;
export async function nativePushPermission(){
 if(!nativePushReady())return "unsupported";
 try{const p=await PushNotifications.checkPermissions();return p.receive==="granted"?"granted":p.receive==="denied"?"denied":"default";}catch{return "unsupported";}
}
export async function requestNativePush({prompt=true}={}){
 if(!nativePushReady())return {token:null,reason:"native_setup"};
 try{
  let p=await PushNotifications.checkPermissions();
  if(p.receive==="denied")return {token:null,reason:"denied"};
  if(p.receive!=="granted"&&prompt)p=await PushNotifications.requestPermissions();
  if(p.receive!=="granted")return {token:null,reason:p.receive==="denied"?"denied":"dismissed"};
  if(registration)return registration;
  registration=(async()=>{
   const handles=[];let finish;
   const result=new Promise(resolve=>{finish=resolve;});
   const timer=setTimeout(()=>finish({token:null,reason:"no_token"}),15000);
   try{
    handles.push(await PushNotifications.addListener("registration",t=>finish(!t.value?{token:null,reason:"no_token"}:looksLikeApnsToken(t.value)?{token:null,reason:"native_setup"}:{token:t.value,reason:null})));
    handles.push(await PushNotifications.addListener("registrationError",()=>finish({token:null,reason:"native_setup"})));
    await PushNotifications.register();
    return await result;
   }catch{return {token:null,reason:"native_setup"};}
   finally{clearTimeout(timer);await Promise.allSettled(handles.map(h=>h.remove()));}
  })();
  try{return await registration;}finally{registration=null;}
 }catch{return {token:null,reason:"native_setup"};}
}
export function nativeForegroundMessage(callback){
 let stop=false,handle;
 PushNotifications.addListener("pushNotificationReceived",n=>{
  if(!stop)callback({notification:{title:n.title,body:n.body},data:n.data||{}});
 }).then(h=>{if(stop)void h.remove();else handle=h;}).catch(()=>{});
 return ()=>{stop=true;void handle?.remove();};
}
// The page a tapped notification is about: the server puts it in data.link.
// Same-site paths only.
export function notificationLink(data){
 const link=data&&typeof data.link==="string"?data.link:"";
 return link.startsWith("/")&&!link.startsWith("//")&&!link.includes("\\")?link:null;
}
// Tapping a notification opens the app; this then opens the page it is about.
export function onNativeNotificationTap(go){
 if(!nativePushReady())return ()=>{};
 let stop=false,handle;
 PushNotifications.addListener("pushNotificationActionPerformed",a=>{
  const link=notificationLink(a?.notification?.data);
  if(!stop&&link)go(link);
 }).then(h=>{if(stop)void h.remove();else handle=h;}).catch(()=>{});
 return ()=>{stop=true;void handle?.remove();};
}
