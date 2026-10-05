// A scoped display index and temporary tablet grant; no raw card UIDs or PINs.
const KEY = "tt_boarding_card_index_v1";
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } };
export function clearBoardingDirectory() { localStorage.removeItem(KEY); }
export function saveBoardingDirectory(data, device) {
  const id = device?.device_id || device?.id;
  if (data?.version !== 1 || data.device_id !== id || data.company_id !== device.company_id || data.vehicle_id !== device.vehicle_id ||
      !Array.isArray(data.staff) || !/^[a-f0-9]{64}$/.test(data.directory_grant || "") ||
      !Number.isFinite(Date.parse(data.generated_at)) || !(Date.parse(data.expires_at) > Date.now()) ||
      Date.parse(data.expires_at) - Date.parse(data.generated_at) > 24 * 3600_000 + 1000) throw new Error("Passenger directory update is invalid");
  const staff = data.staff.map(p => {
    if (!p.id || typeof p.full_name !== "string" || !/^[a-f0-9]{64}$/.test(p.card_fingerprint || "")) throw new Error("Passenger directory entry is invalid");
    return { id:p.id, full_name:p.full_name, photo_url:typeof p.photo_url === "string" ? p.photo_url : "", card_fingerprint:p.card_fingerprint };
  });
  const snapshot = { version:1, device_id:id, company_id:data.company_id, vehicle_id:data.vehicle_id, generated_at:data.generated_at, expires_at:data.expires_at, directory_grant:data.directory_grant, staff };
  // Replace in one storage operation. A failed update never erases the old list.
  localStorage.setItem(KEY,JSON.stringify(snapshot));
  return snapshot;
}
// Names only, for the tablet's "who's on this list" view.
export function boardingDirectoryNames() {
  const d=read();
  return d?.version===1 && Array.isArray(d.staff) ? d.staff.map(p=>p.full_name).filter(Boolean).sort((a,b)=>a.localeCompare(b)) : [];
}
export function boardingDirectoryInfo() {
  const d=read();
  return d?.version===1 ? {count:d.staff?.length || 0,updated:d.generated_at,expires:d.expires_at} : null;
}
export async function localCardLookup(uid, device) {
  const d=read(), id=device?.device_id || device?.id;
  if (!d || d.device_id!==id || d.company_id!==device.company_id || d.vehicle_id!==device.vehicle_id || !(Date.parse(d.expires_at)>Date.now())) return null;
  const normalized=String(uid || "").replace(/[^0-9a-f]/gi,"").toUpperCase();
  if (normalized.length<8 || normalized.length>20) return null;
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(id+":"+normalized));
  const fingerprint=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
  const matches=d.staff.filter(p=>p.card_fingerprint===fingerprint);
  if (matches.length!==1) return null;
  const p=matches[0];
  let status="boarded";
  try { if (JSON.parse(localStorage.getItem("tt_kiosk_last_status") || "{}")[p.id]==="boarded") status="off_board"; } catch { /* default */ }
  return {staff:{id:p.id,full_name:p.full_name,photo_url:p.photo_url},next_status:status,directory_grant:d.directory_grant,card_fingerprint:fingerprint,local_lookup:true};
}
