import { helperLinkLost } from "./helperHealth";
export function adminTabletHealth(device, now=Date.now()) {
 const report=(label,tone,attention=false)=>({label,tone,attention});
 const fresh=iso=>{const t=Date.parse(iso);return Number.isFinite(t) && t<=now+60000 && now-t<=10*60*1000;};
 if(device.status && device.status!=="active")return report("Inactive","offline");
 if(!device.paired)return report("Not paired","offline");
 if(!fresh(device.last_seen))return report(device.last_seen?"Not reporting":"No tablet report","warning",true);
 if(helperLinkLost(device,now))return report("Helper cannot reach screen","warning",true);
 const h=device.helper_health;
 if(!h || !fresh(h.reported_at))return report(h?"Helper report is stale":"Helper status unknown","offline",!!h);
 if(typeof h.battery==="number" && h.battery<=20 && !h.charging)return report("Low battery","warning",true);
 if(h.reader && !/^(connected|card reader off|paused)/i.test(h.reader))return report("Reader: "+h.reader,"warning",true);
 if(h.gps && !/^(fix|connected|paused|gps off)/i.test(h.gps) && !h.parked)return report("GPS: "+h.gps,"warning",true);
 if(h.hotspot && /^(blocked|failed)/i.test(h.hotspot) && !h.parked)return report("Hotspot: "+h.hotspot,"warning",true);
 if(device.kiosk_type==="bus_boarding" && !/^connected/i.test(h.reader || ""))return report(h.reader==="card reader off"?"Reader switched off":"Reader status unknown","warning",true);
 return report("Helper reporting","success");
}
