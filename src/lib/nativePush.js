import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
export const nativePushPlatform=()=>Capacitor.isNativePlatform()?Capacitor.getPlatform():null;
let registration=null;
export async function nativePushPermission(){
 if(nativePushPlatform()!=="android")return "unsupported";
 try{const p=await PushNotifications.checkPermissions();return p.receive==="granted"?"granted":p.receive==="denied"?"denied":"default";}catch{return "unsupported";}
}
export async function requestNativePush({prompt=true}={}){
 // This backend sends through FCM. Capacitor's iOS APNs token is not an FCM
 // token; don't register it or falsely report that iOS push is working.
 if(nativePushPlatform()!=="android")return {token:null,reason:"native_setup"};
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
    handles.push(await PushNotifications.addListener("registration",t=>finish(t.value?{token:t.value,reason:null}:{token:null,reason:"no_token"})));
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
