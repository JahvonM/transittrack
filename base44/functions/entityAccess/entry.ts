import { durableCreate } from '../../shared/durableOperation.ts';
import { ADMIN_READ_SPECS } from '../../shared/adminReadSpecs.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { assignedAccessRole } from '../../shared/accessRoles.ts';
import { retry429 } from '../../shared/retry429.ts';
const ENTITY_FIELDS = {"Company": ["name", "logo_url", "phone", "access_code", "service_types", "description", "boss_phone", "secretary_phone"], "AuditLog": ["actor_email", "actor_name", "actor_role", "action", "entity", "record_id", "summary", "changes", "page", "card_uid", "status"], "Vehicle": ["capacity", "company_id", "company_name", "current_lat", "current_lng", "current_odometer", "driver_email", "driver_name", "driver_pin", "entry_code", "heading", "image_url", "last_location_update", "last_ping_logged_at", "name", "near_stop_id", "plate_number", "remote_tracking_lock", "route_id", "speed", "status", "tracking_active", "trail", "type", "wired_gps_connected", "fleet_number", "make", "model", "year", "vin", "engine", "transmission", "hours", "fuel_type", "last_inspection_date", "in_service", "model_3d", "trip_direction", "return_pickup_state"], "Trip": ["vehicle_id", "vehicle_name", "plate_number", "route_id", "route_name", "company_id", "company_name", "driver_email", "driver_name", "passenger_name", "passenger_phone", "pickup_name", "pickup_lat", "pickup_lng", "dropoff_name", "dropoff_lat", "dropoff_lng", "scheduled_time", "status", "started_at", "arrived_at", "completed_at", "pickup_signature_url", "pickup_signed_by", "pickup_signed_at", "dropoff_signature_url", "dropoff_signed_by", "dropoff_signed_at"], "InspectionResult": ["vehicle_id", "vehicle_name", "company_id", "company_name", "inspection_name", "section_name", "inspection_item", "condition", "fault_found", "fault_description", "photo_url", "repair_required", "notes", "inspector_id", "inspector_name", "inspection_date"], "GroupMessage": ["vehicle_id", "vehicle_name", "company_id", "company_name", "channel", "sender_role", "sender_name", "text", "message_type", "media_url", "edited"], "MaintenanceSettings": ["auto_create_faults", "maintenance_reminder_days", "enable_photo_attachments", "inspection_reminder_days"], "Advertisement": ["title", "message", "image_url", "link", "active", "order"], "PushToken": ["token", "email", "device_id", "role", "company_id"], "LocationPing": ["company_id", "lat", "lng", "recorded_at", "speed", "vehicle_id"], "FrontDeskSignIns": ["full_name", "company_name", "reason", "signature_url", "signed_at"], "ClientError": ["message", "stack", "url", "user_email", "user_role", "user_agent", "source", "device_id", "emailed"], "Driver": ["full_name", "email", "phone", "photo_url", "company_id", "company_name", "employee_id", "nfc_card_uid"], "DriverShift": ["vehicle_id", "vehicle_name", "company_id", "company_name", "driver_name", "driver_email", "device_id", "started_at", "ended_at", "duration_minutes", "notes"], "NfcCard": ["card_uid", "card_type", "holder_type", "holder_source", "holder_id", "holder_name", "employee_id", "role", "assigned_vehicle", "company_id", "company_name", "access_level", "issue_date", "expiry_date", "issued_by", "is_active", "revoked_at", "revoked_by", "revoke_reason"], "Broadcast": ["type", "title", "message", "vehicle_name", "company_id", "company_name", "driver_name", "driver_email", "is_reply", "vehicle_id", "return_pickup"], "KioskDevice": ["company_id", "company_name", "device_info", "update_requested_at", "directory_sent_at", "app_health", "helper_health", "native_tracking_health", "kiosk_type", "label", "last_seen", "paired", "pairing_code", "status", "vehicle_id", "vehicle_name", "pairing_expires_at"], "Route": ["company_id", "company_name", "name", "type", "stops", "active", "path", "path_via", "pickup_merge_m"], "Inspection": ["driver_name", "driver_email", "vehicle_id", "vehicle_name", "company_id", "company_name", "date", "status", "checklist", "odometer_reading", "fuel_level", "needs_service", "service_notes", "template_id", "template_name", "trigger", "results"], "RouteTravelTimes": ["route_id", "route_name", "company_id", "legs", "dwells", "leg_samples", "pings_used", "vehicles_used", "days", "learned_at"], "Fault": ["vehicle_id", "vehicle_name", "company_id", "company_name", "title", "description", "source", "inspection_id", "severity", "status", "photo_url", "repair_required", "reported_by", "resolved_date"], "StaffCheckIn": ["staff_name", "staff_picture_url", "card_tag", "status", "boarded_at", "company_id", "company_name", "vehicle_id", "vehicle_name", "check_in_method"], "CardHolder": ["full_name", "employee_id", "role", "assigned_vehicle", "company_id", "company_name", "notes"], "DrivingEvent": ["company_id", "company_name", "driver_email", "driver_name", "lat", "lng", "occurred_at", "speed_after_kmh", "speed_before_kmh", "type", "vehicle_id", "vehicle_name"], "DriverDocument": ["driver_id", "driver_name", "company_id", "kind", "file_uri", "file_name", "document_number", "expiry_date", "notes"], "Part": ["company_id", "company_name", "part_name", "oem_number", "aftermarket_number", "vehicle_compatibility", "category", "quantity_in_stock", "unit_price", "supplier", "photo_url"], "User": ["role", "company_id", "display_name", "phone", "photo_url", "home_lat", "home_lng", "home_address", "pickup_lat", "pickup_lng", "pickup_name", "pickup_route_id", "pickup_moved", "work_lat", "work_lng", "nfc_tag_id", "access_code", "one_time_code", "one_time_code_expires_at", "whatsapp_linked", "skip_pickup_today", "skip_pickup_until", "late_snooze_active", "late_until", "favorite_stop", "stop_alerts", "theme_accent", "employee_id"], "Workplace": ["name", "company_id", "company_name", "lat", "lng"], "Incident": ["vehicle_id", "vehicle_name", "company_id", "company_name", "driver_name", "driver_email", "type", "details", "occurred_at", "status"], "Contact": ["name", "phone", "email", "type", "nfc_card_tag", "access_code", "company_id", "company_name", "pickup_name", "pickup_lat", "pickup_lng", "dropoff_name", "dropoff_lat", "dropoff_lng", "employee_id", "vehicle_id", "vehicle_name"], "LostItemReport": ["company_id", "company_name", "reporter_name", "reporter_email", "contact", "vehicle_name", "description", "status", "admin_notes"], "InspectionTemplate": ["name", "category", "company_id", "company_name", "frequency_days", "audience", "driver_trigger", "driver_days", "driver_times", "driver_vehicle_ids", "xray_layout", "driver_from_time", "driver_required", "driver_sent_at", "sections"], "MaintenanceSchedule": ["vehicle_id", "vehicle_name", "company_id", "company_name", "service_type", "due_type", "interval_km", "interval_days", "last_service_mileage", "last_service_date", "status", "assigned_mechanic_id", "assigned_mechanic_name", "notes"]};
function randomAccessCode() {
 const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let code='';
 while(code.length<12){const byte=crypto.getRandomValues(new Uint8Array(1))[0];if(byte<Math.floor(256/alphabet.length)*alphabet.length)code+=alphabet[byte%alphabet.length];}
 return code;
}
async function uniqueAccessCode(db,entity,field) {
 // Sequential collision detection only. Concurrent uniqueness needs atomic storage.
 for(let i=0;i<50;i++) {const code=randomAccessCode();if(!(await db[entity].filter({[field]:code},'-created_date',1)).length)return code;}
 fail(503,'Could not allocate a unique code');
}
ENTITY_FIELDS.KioskDevice.push('display_layout');
const MAINTENANCE = new Set(["Vehicle", "Fault", "Inspection", "InspectionResult", "InspectionTemplate", "Part", "MaintenanceSchedule", "MaintenanceSettings"]);

for(const name of ['InspectionResult','Fault']) ENTITY_FIELDS[name].push('client_request_id');
ENTITY_FIELDS.GroupMessage.push('sender_id','sender_email');
ENTITY_FIELDS.LostItemReport.push('reporter_id');
ENTITY_FIELDS.Company.push('access_code_expires_at');
ENTITY_FIELDS.Advertisement.push('company_id');
// Driver phone app: the access switch, and the private photos a driver sends
// with a problem report (written only by the driverPhone function).
ENTITY_FIELDS.Driver.push('phone_app_access');
ENTITY_FIELDS.Incident.push('photo_uris','source');
ENTITY_FIELDS.DriverShift.push('started_with','ended_with');
ENTITY_FIELDS.Vehicle.push('backup_gps_driver_email','backup_gps_since','road_next_stop');
// The latest Wi-Fi/hotspot command's status for Admin → Kiosk tablets (never the command itself, which can hold a Wi-Fi password).
ENTITY_FIELDS.KioskDevice.push('network_status');
ENTITY_FIELDS.KioskDevice.push('control_status');
// Admin → App errors: what happened before an error, and marking it fixed.
ENTITY_FIELDS.ClientError.push('area','context','breadcrumbs','status','resolved_at','resolved_by');
// Jobs dispatch gives a bus. The signatures (and where and by how many guests
// they were given) come from the driver tablet only, and the invoice a job is
// on from billing only.
const JOB_SIGNATURE_FIELDS=['pickup_signature_uri','pickup_signed_role','pickup_signed_guests','pickup_signed_lat','pickup_signed_lng','pickup_signature_request_id','dropoff_signature_uri','dropoff_signed_role','dropoff_signed_guests','dropoff_signed_lat','dropoff_signed_lng','dropoff_signature_request_id'];
ENTITY_FIELDS.Trip.push('job_type','client_id','client_name','pickup_address','dropoff_address','flight_number','flight_time','guests','luggage','notes','stops','end_time','price','currency','cancelled_at','invoice_id','invoice_number',...JOB_SIGNATURE_FIELDS);
// Saved places, clients and invoices for jobs. None is a company list, so only
// an administrator can read or change them.
ENTITY_FIELDS.Place=['company_id','name','kind','address','lat','lng','notes'];
ENTITY_FIELDS.Client=['company_id','name','kind','contact_name','email','phone','address','currency','notes'];
ENTITY_FIELDS.Invoice=['company_id','company_name','client_id','client_name','client_email','client_address','number','period_start','period_end','issued_at','due_date','lines','total','currency','status','sent_at','paid_at','voided_at','notes'];
const ADMIN_ONLY_FIELDS={Driver:new Set(['phone_app_access']),Trip:new Set(['client_id','client_name','price','currency'])};
const SERVER_ONLY_FIELDS={Incident:new Set(['photo_uris','source']),KioskDevice:new Set(['recordings_request','support_request','network_status', 'control_status']),Trip:new Set([...JOB_SIGNATURE_FIELDS,'invoice_id','invoice_number'])};
const JOB_TYPES=new Set(['airport_pickup','airport_dropoff','hotel_tour','staff_run','transfer']);
const CURRENCIES=new Set(['XCD','USD']);
const text=(data,field,max)=>{ if(!Object.hasOwn(data,field)||data[field]===null) return; if(typeof data[field]!=='string'||data[field].length>max) fail(400,'Invalid '+field.replace(/_/g,' ')); data[field]=data[field].trim(); };
const wholeNumber=(data,field,max)=>{ if(!Object.hasOwn(data,field)) return; if(data[field]===null||data[field]==='') { data[field]=null; return; } const n=Number(data[field]); if(!Number.isInteger(n)||n<0||n>max) fail(400,'Invalid '+field.replace(/_/g,' ')); data[field]=n; };
const when=(data,field)=>{ if(!Object.hasOwn(data,field)) return; if(data[field]===null||data[field]==='') { data[field]=null; return; } if(typeof data[field]!=='string'||!Number.isFinite(Date.parse(data[field]))) fail(400,'Invalid '+field.replace(/_/g,' ')); };
const point=(lat,lng,what)=>{ if(lat==null&&lng==null) return; const a=Number(lat),b=Number(lng); if(lat==null||lng==null||!Number.isFinite(a)||!Number.isFinite(b)||Math.abs(a)>90||Math.abs(b)>180) fail(400,'Invalid '+what+' location'); };
function cleanJob(data) {
 if(Object.hasOwn(data,'job_type')&&data.job_type!==null&&!JOB_TYPES.has(data.job_type)) fail(400,'Invalid job type');
 for(const [field,max] of [['client_id',100],['client_name',120],['pickup_address',300],['dropoff_address',300],['flight_number',20],['notes',2000]]) text(data,field,max);
 for(const [field,max] of [['guests',500],['luggage',500]]) wholeNumber(data,field,max);
 for(const field of ['flight_time','end_time','cancelled_at']) when(data,field);
 point(data.pickup_lat,data.pickup_lng,'pickup');point(data.dropoff_lat,data.dropoff_lng,'drop-off');
 if(Object.hasOwn(data,'price')&&data.price!==null&&data.price!=='') {
  const price=Number(data.price);
  if(!Number.isFinite(price)||price<0||price>10_000_000) fail(400,'Invalid price');
  data.price=Math.round(price*100)/100;
 } else if(Object.hasOwn(data,'price')) data.price=null;
 if(Object.hasOwn(data,'currency')&&data.currency!==null&&!CURRENCIES.has(data.currency)) fail(400,'Invalid currency');
 if(Object.hasOwn(data,'stops')) {
  const stops=data.stops??[];
  if(!Array.isArray(stops)||stops.length>30) fail(400,'A tour can have up to 30 stops');
  data.stops=stops.map(s=>{
   if(!s||typeof s!=='object'||typeof s.name!=='string'||!s.name.trim()||s.name.length>120||(s.address!=null&&(typeof s.address!=='string'||s.address.length>300))) fail(400,'Invalid tour stop');
   point(s.lat,s.lng,'tour stop');
   const stop={name:s.name.trim(),address:s.address||'',lat:s.lat==null?null:Number(s.lat),lng:s.lng==null?null:Number(s.lng)};
   if(typeof s.reached_at==='string'&&Number.isFinite(Date.parse(s.reached_at))) stop.reached_at=s.reached_at;
   return stop;
  });
 }
}
function cleanPlace(data,existing) {
 if(!existing&&(typeof data.name!=='string'||!data.name.trim())) fail(400,'A place needs a name');
 for(const [field,max] of [['name',120],['address',300],['notes',1000]]) text(data,field,max);
 if(Object.hasOwn(data,'kind')&&!['airport','hotel','attraction','other'].includes(data.kind)) fail(400,'Invalid kind of place');
 if(Object.hasOwn(data,'lat')!==Object.hasOwn(data,'lng')) fail(400,'Place coordinates must be supplied together');
 point(data.lat,data.lng,'place');
}
function cleanClient(data,existing) {
 if(!existing&&(typeof data.name!=='string'||!data.name.trim())) fail(400,'A client needs a name');
 for(const [field,max] of [['name',120],['contact_name',120],['email',200],['phone',40],['address',300],['notes',2000]]) text(data,field,max);
 if(data.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) fail(400,'Invalid email');
 if(Object.hasOwn(data,'kind')&&!['hotel','company','tour_operator','person','other'].includes(data.kind)) fail(400,'Invalid kind of client');
 if(Object.hasOwn(data,'currency')&&!CURRENCIES.has(data.currency)) fail(400,'Invalid currency');
}
const SECURITY_FIELDS={Company:new Set(['access_code','access_code_expires_at']),KioskDevice:new Set(['pairing_code','pairing_expires_at','paired','status'])};
const META = ['id','created_date','updated_date','created_by','created_by_id'];
const CREDENTIALS = new Set(['driver_pin','entry_code','access_code','one_time_code','one_time_code_expires_at','nfc_tag_id','nfc_card_tag','nfc_card_uid','card_uid','card_tag','pairing_code','token','token_hash','salt','pin_hash','password','device_token','driver_grant','verification_grant']);
const COMPANY_ENTITIES = new Set(['Vehicle','Trip','InspectionResult','GroupMessage','LocationPing','Driver','DriverShift','NfcCard','Broadcast','KioskDevice','Route','Inspection','RouteTravelTimes','Fault','StaffCheckIn','CardHolder','DrivingEvent','DriverDocument','Part','Workplace','Incident','Contact','LostItemReport','InspectionTemplate','MaintenanceSchedule']);
const PASSENGER_READ = new Set(['Company','Vehicle','Route','RouteTravelTimes','Broadcast','Trip','GroupMessage','Workplace','Advertisement']);
const COMPANY_READ = new Set([...COMPANY_ENTITIES, 'Company','Advertisement']);
const PROFILE_FIELDS = new Set(['full_name','display_name','phone','photo_url','home_lat','home_lng','home_address','pickup_lat','pickup_lng','pickup_name','pickup_route_id','work_lat','work_lng','whatsapp_linked','skip_pickup_today','skip_pickup_until','late_snooze_active','late_until','favorite_stop','stop_alerts','theme_accent']);
function fail(status, message) { throw Object.assign(new Error(message), { status }); }
// Photos, voice notes, logos and the like are files uploaded through the app,
// so anyone but an administrator may only point these fields at the app's own
// file storage. That stops a chat "photo" that is really a link to another
// site (which would see who opened it) or a script link.
function appStorageUrl(value) {
 try {
  const url = new URL(value);
  if (url.protocol !== 'https:') return false;
  const host = url.hostname;
  return host === 'base44.app' || host.endsWith('.base44.app') || host === 'base44.com' || host.endsWith('.base44.com')
   || (host.endsWith('.supabase.co') && url.pathname.startsWith('/storage/v1/object/public/'));
 } catch { return false; }
}
function checkLinks(user, data) {
 for (const [key, value] of Object.entries(data)) {
  if (!/_url$/.test(key) || value === '' || value === null) continue;
  if (typeof value !== 'string' || value.length > 2000) fail(400, 'Invalid link: ' + key);
  if (user.role === 'admin' ? !/^https:\/\//i.test(value) : !appStorageUrl(value)) fail(400, 'Use a file uploaded in the app for ' + key);
 }
 if (data.link !== undefined && data.link !== '' && data.link !== null && (typeof data.link !== 'string' || !/^https?:\/\//i.test(data.link))) fail(400, 'Links must start with https://');
 if (data.message_type !== undefined && !['text', 'image', 'audio'].includes(data.message_type)) fail(400, 'Invalid message type');
}
function pick(row, fields) { return Object.fromEntries(fields.filter(k => row[k] !== undefined).map(k => [k,row[k]])); }
function scrub(value, allowCodes=false) {
 if (Array.isArray(value)) return value.map(v=>scrub(v,allowCodes));
 if (!value || typeof value !== 'object') return value;
 return Object.fromEntries(Object.entries(value).filter(([k]) => !CREDENTIALS.has(k) || (allowCodes && ['access_code','pairing_code'].includes(k))).map(([k,v])=>[k,scrub(v,allowCodes)]));
}

async function liveMembership(db, row, companyReads = new Map()) {
 if (!row.expires_at && !row.code_hash) return true; // Explicit admin approval.
 if (!row.code_hash || (row.scope !== 'passenger' && !(Date.parse(row.expires_at) > Date.now()))) return false;
 if (!companyReads.has(row.company_id)) companyReads.set(row.company_id,
  db.Company.get(row.company_id).catch(error => {
   if ((error.status ?? error.response?.status) === 404) return null;
   throw error;
  }));
 const company=await companyReads.get(row.company_id);
 if(!company) return false;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(company.access_code || ''));
 const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 return row.code_hash===hash;
}

async function memberships(db, user, ctx = {}) {
 const rows = ctx.membershipRows?.get(user.id) ?? await db.CompanyMembership.filter({ user_id:user.id, active:true }, '-updated_date', 100);
 const approved=[];
 for(const row of rows) if(row.scope === (user.role === 'company' ? 'manager' : 'passenger') && await liveMembership(db,row,ctx.companyReads)) approved.push(row);
 return approved;
}
async function context(base44) {
 const session = await base44.auth.me();
 if (!session) return { user:null, companies:[] };
 const user = await base44.asServiceRole.entities.User.get(session.id);
 if (!user || user.id !== session.id) fail(401,'Sign in required');
 const companies = user.role === 'admin' || user.role === 'mechanic' ? [] : (await memberships(base44.asServiceRole.entities,user)).map(m=>m.company_id);
 return {user,companies,parents:new Map(),companyReads:new Map()};
}
async function tenantOf(db, name, row, parents = new Map()) {
  if (name === 'Company') return row.id;
  const parent = row.vehicle_id ? ['Vehicle', row.vehicle_id] : row.driver_id ? ['Driver', row.driver_id] : null;
  if (!parent) return row.company_id || null;
  const key = parent.join(':');
  // Request-local only: a page of trips/messages often shares the same bus.
  if (!parents.has(key)) parents.set(key, db[parent[0]].get(parent[1]).catch(error => {
    if (error.status === 404) return null;
    throw error;
  }));
  const record = await parents.get(key);
  if (!record || (row.company_id && row.company_id !== record.company_id)) return null;
  return record.company_id;
}
async function visible(db, ctx, name, row) {
 const {user,companies} = ctx;
 if (name === 'Advertisement') return true;
 if (!user) return false;
 if (user.role === 'admin') return true;
 if (name === 'User') return row.id === user.id;
 if (name === 'PushToken') return row.email === user.email;
 if(name==='LostItemReport' && user.role!=='company') return row.reporter_id===user.id && companies.includes(row.company_id);
 if(name==='Broadcast' && !row.company_id) return true;
 if (user.role === 'mechanic') return MAINTENANCE.has(name) || name === 'Company' || (name === 'GroupMessage' && row.channel === 'mechanic');
 const tenant = await tenantOf(db,name,row,ctx.parents);
 if (!tenant || !companies.includes(tenant)) return false;
 if (name === 'Broadcast' && row.return_pickup && !['company','admin'].includes(user.role)) {
  if (!row.vehicle_id) return false;
  return (await memberships(db,user,ctx)).some(m=>m.scope==='passenger' && m.company_id===tenant && m.vehicle_id===row.vehicle_id);
 }
 if (user.role === 'company') return COMPANY_READ.has(name);
 if (!PASSENGER_READ.has(name)) return false;
 if (name === 'GroupMessage' && row.channel !== 'staff') return false;
 return true;
}
function project(ctx,name,row) {
 if (!row) return row;
 const role=ctx.user?.role;
 let fields=[...META,...(ENTITY_FIELDS[name] || [])];
 if (name === 'User') fields=[...META,'email','full_name','role','company_id',...PROFILE_FIELDS];
 if (name === 'Company' && !['admin','company'].includes(role)) fields=[...META,'name','phone','logo_url','service_types','description'];
 if (!['admin','company','mechanic'].includes(role) && name === 'Vehicle') fields=[...META,'name','type','company_id','company_name','capacity','route_id','current_lat','current_lng','speed','heading','status','driver_name','image_url','model_3d','tracking_active','last_location_update','trail','trip_direction','return_pickup_state','road_next_stop'];
 if (!['admin','company'].includes(role) && name === 'Trip') fields=[...META,'company_id','vehicle_id','vehicle_name','route_id','route_name','pickup_name','dropoff_name','scheduled_time','status','started_at','arrived_at','completed_at'];
 const allowCodes=['admin','company'].includes(role) && ['Company','KioskDevice'].includes(name);
 const out=scrub(pick(row,fields),allowCodes);
 if(name==='GroupMessage' && row.sender_email) out.created_by=row.sender_email;
 if (name==='User' && row.id===ctx.user?.id) out.company_id=ctx.companies[0] || '';
 return out;
}
async function projectRecord(db,ctx,name,row) {
 const out=project(ctx,name,row);
 if(name==='User' && row?.id===ctx.user?.id) out.access_role=await assignedAccessRole(db,ctx.user);
 if(name==='User' && ctx.user?.role==='admin') out.access_role_id=row?.access_role_id || '';
 if(name==='User' && row && ctx.user?.role==='admin') {
  const approved=await memberships(db,row,ctx);
  out.company_id=approved[0]?.company_id || '';
  out.company_membership_approved=approved.length>0;
 }
 return out;
}
function cleanQuery(name,query,role) {
 if (!query || typeof query!=='object' || Array.isArray(query)) fail(400,'Invalid query');
 const encoded=JSON.stringify(query);
 if (encoded.length>8000) fail(400,'Query too large');
 for(const key of Object.keys(query)) {
  if (['$or','$and'].includes(key)) {
   if (!Array.isArray(query[key]) || query[key].length>20) fail(400,'Invalid query');
   query[key].forEach(q=>cleanQuery(name,q,role));
  } else if (![...META,...ENTITY_FIELDS[name], 'email','full_name'].includes(key) || CREDENTIALS.has(key)) fail(400,'Unsupported query field');
 }
 return query;
}
async function prepare(db,ctx,name,input,existing=null) {
 const user=ctx.user;
 if (!user) fail(401,'Sign in required');
 if (!input || typeof input!=='object' || Array.isArray(input)) fail(400,'Invalid data');
 const allowed=new Set(ENTITY_FIELDS[name]);
 if(name==='User') ['full_name','email'].forEach(k=>allowed.add(k));
 for (const key of Object.keys(input)) {
  if(name==='User' && key==='access_role_id') fail(403,'Use custom role assignment');
  if(SECURITY_FIELDS[name]?.has(key)) fail(403,'Use server access-code management');
  if(SERVER_ONLY_FIELDS[name]?.has(key)) fail(403,'Set by the driver app only');
  if(ADMIN_ONLY_FIELDS[name]?.has(key) && user.role!=='admin') fail(403,'Administrators only');
  if (!allowed.has(key)) fail(400,'Unsupported field: '+key);
  if (CREDENTIALS.has(key) && !(name==='Company' && key==='access_code') && !(name==='KioskDevice' && key==='pairing_code') && !(name==='PushToken' && key==='token')) fail(403,'Use the protected credential workflow');
 }
 checkLinks(user, input);
 if(input.client_request_id!==undefined && (existing || typeof input.client_request_id!=='string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(input.client_request_id))) fail(400,'Invalid immutable request ID');
 const data={...input};
 if(name==='KioskDevice' && data.display_layout!==undefined && !['auto','tablet','phone'].includes(data.display_layout)) fail(400,'Invalid kiosk layout');
 if(name==='Invoice') fail(403,'Invoices are made and changed in Completed & billing');
 if(name==='Trip') {
  cleanJob(data);
  if(data.client_id) {
   const client=await db.Client.get(data.client_id).catch(()=>null);
   if(!client) fail(400,'Client not found');
   data.client_name=client.name;
  } else if(Object.hasOwn(data,'client_id')) data.client_name='';
 }
 if(name==='Place') cleanPlace(data,existing);
 if(name==='Client') cleanClient(data,existing);
 // A drawn road is a list of map points only, of a sane size.
 if(name==='Route' && Object.hasOwn(data,'pickup_merge_m') && data.pickup_merge_m!==null) {
  const m=Number(data.pickup_merge_m);
  if(!Number.isFinite(m)||m<0||m>500) fail(400,'Pickup merge distance must be 0 to 500 metres');
  data.pickup_merge_m=Math.round(m);
 }
 if(name==='Route') for(const [field,max] of [['path',5000],['path_via',200]]) {
  if(!Object.hasOwn(data,field)) continue;
  const points=data[field]??[];
  if(!Array.isArray(points)||points.length>max) fail(400,'Invalid route road');
  data[field]=points.map(p=>{
   const lat=Number(p?.lat), lng=Number(p?.lng);
   if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<-90||lat>90||lng<-180||lng>180) fail(400,'Invalid route road');
   return {lat,lng};
  });
 }
 if(name==='Advertisement') {
  if(!['admin','company'].includes(user.role))fail(403,'Advertisement management forbidden');
  if(user.role==='company') {
   if(existing&&(!existing.company_id||!ctx.companies.includes(existing.company_id)))fail(403,'Own company advertisements only');
   if(!existing&&!data.company_id&&ctx.companies.length===1)data.company_id=ctx.companies[0];
   const owner=data.company_id||existing?.company_id;
   if(!owner||!ctx.companies.includes(owner))fail(403,'Approved company assignment required');
   if(existing&&data.company_id&&data.company_id!==existing.company_id)fail(403,'Advertisement ownership cannot be changed');
   if(!(await db.Company.get(owner).catch(()=>null)))fail(400,'Company not found');
  }else if(data.company_id&&!(await db.Company.get(data.company_id).catch(()=>null)))fail(400,'Company not found');
 }
 if (user.role==='company' && !ctx.companies.length) fail(403,'Approved company membership required');
 if (name==='User') {
  for(const [field,min,max] of [['pickup_lat',-90,90],['pickup_lng',-180,180]]) {
   if(Object.hasOwn(data,field) && (!Number.isFinite(data[field]) || data[field]<min || data[field]>max))fail(400,'Invalid pickup coordinate');
  }
  if(Object.hasOwn(data,'pickup_lat')!==Object.hasOwn(data,'pickup_lng'))fail(400,'Pickup coordinates must be supplied together');
  if(data.pickup_route_id) {
   const route=await db.Route.get(data.pickup_route_id).catch(()=>null);
   if(!route || (user.role!=='admin'&&!ctx.companies.includes(route.company_id)))fail(403,'Approved company route required');
  }
  if (user.role !== 'admin') {
   if (!existing || existing.id!==user.id || Object.keys(data).some(k=>!PROFILE_FIELDS.has(k))) fail(403,'Profile fields only');
  } else if(data.role && !['admin','company','mechanic','driver','staff','passenger'].includes(data.role)) fail(400,'Invalid role');
  return data;
 }
 if (name==='AuditLog') return {...data, actor_email:user.email,actor_name:user.full_name||'',actor_role:user.role};
 if (name==='ClientError') {
  // Errors are written by reportClientError; an administrator may only mark them fixed (or not).
  if (user.role!=='admin' || !existing || Object.keys(data).some(k=>!['status','resolved_at','resolved_by'].includes(k)) || (data.status!==undefined && !['new','resolved'].includes(data.status))) fail(403,'Use reportClientError');
  return {...data, resolved_by: data.status==='resolved' ? (user.full_name||user.email) : '', resolved_at: data.status==='resolved' ? new Date().toISOString() : null};
 }
 if (name==='PushToken') return {...data,email:user.email,role:user.role,company_id:ctx.companies[0]||''};
 if (user.role !== 'admin') {
  if(user.role==='mechanic') {
   if (!(MAINTENANCE.has(name) || (name==='GroupMessage' && (data.channel||existing?.channel)==='mechanic'))) fail(403,'Forbidden');
   if(name==='Vehicle' && Object.keys(data).some(k=>!['current_odometer','last_inspection_date','in_service','hours','status'].includes(k))) fail(403,'Maintenance vehicle fields only');
  } else if(user.role==='company') {
   if(!COMPANY_READ.has(name) || (name==='Company' && !existing)) fail(403,'Forbidden');
  } else if (name!=='GroupMessage' && name!=='LostItemReport') fail(403,'Forbidden');
 }
 if(name==='LostItemReport' && user.role!=='admin' && user.role!=='company') {
  if(existing && existing.reporter_id!==user.id) fail(403,'Own reports only');
  data.reporter_id=user.id;data.reporter_email=user.email;data.reporter_name=user.full_name||user.email;
 }
 if (name==='GroupMessage') {
  const channel=data.channel||existing?.channel||'staff';
  if(user.role!=='admin') {
   if(user.role==='mechanic' ? channel!=='mechanic' : user.role==='company' ? !['company','staff','dispatch'].includes(channel) : channel!=='staff') fail(403,'Forbidden channel');
   if(existing && existing.sender_id!==user.id) fail(403,'Own messages only');
  }
  data.sender_role=user.role;data.sender_name=user.full_name||user.email;data.sender_id=user.id;data.sender_email=user.email;
 }
 if(name==='Company' && !existing && user.role==='admin') return {...data,access_code:await uniqueAccessCode(db,'Company','access_code'),};
 if(COMPANY_ENTITIES.has(name) && !existing && !data.company_id && !data.vehicle_id && ctx.companies.length===1) data.company_id=ctx.companies[0];
 const combined={...existing,...data};
 let tenant=await tenantOf(db,name,combined);
 if(COMPANY_ENTITIES.has(name) || name==='Company') {
  if(!tenant && ['InspectionTemplate','Part'].includes(name) && ['admin','mechanic'].includes(user.role)) return data;
  if(!tenant && name==='Broadcast' && user.role==='admin') return data;
  if(!tenant) fail(400,'Company assignment required');
  if(user.role!=='admin' && user.role!=='mechanic' && !ctx.companies.includes(tenant)) fail(403,'Company access denied');
  if(existing && existing.company_id && data.company_id && data.company_id!==existing.company_id) fail(403,'Company assignment cannot be changed here');
  if(name!=='Company') data.company_id=tenant;
  if(name!=='Company' && !(await db.Company.get(tenant).catch(()=>null))) fail(400,'Company not found');
 }
 for(const [field,parent] of [['route_id','Route'],['inspection_id','Inspection'],['driver_id','Driver'],['template_id','InspectionTemplate']]) {
  if(data[field]) { const row=await db[parent].get(data[field]).catch(()=>null); const parentTenant=row ? await tenantOf(db,parent,row) : null; if(!row || (tenant && parentTenant!==tenant && !(parent==='InspectionTemplate' && !parentTenant && !row.company_id))) fail(403,'Related record belongs to another company'); }
 }
 if(name==='KioskDevice'&&['driver','bus_boarding','job_signing'].includes(combined.kiosk_type)&&!combined.vehicle_id) fail(400,'Vehicle assignment required');
 if(name==='KioskDevice'&&!existing) return {...data,status:'active',paired:false,pairing_code:await uniqueAccessCode(db,'KioskDevice','pairing_code'),pairing_expires_at:new Date(Date.now()+15*60_000).toISOString()};
 return data;
}
async function approveMembership(db,target,companyId) {
 if (companyId && !(await db.Company.get(companyId).catch(()=>null))) fail(400,'Company not found');
 const rows=await db.CompanyMembership.filter({user_id:target.id},'-updated_date',100);
 for(const row of rows) await db.CompanyMembership.update(row.id,{active:false});
 if(companyId) await db.CompanyMembership.create({user_id:target.id,company_id:companyId,scope:target.role==='company'?'manager':'passenger',active:true});
}
async function replayCreate(db,ctx,name,data) {
 if(!data.client_request_id) return db[name].create(data);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data)));
 const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 const prior=(await db[name].filter({client_request_id:data.client_request_id,request_actor_id:ctx.user.id},'-created_date',1))[0];
 if(prior) { if(prior.request_hash!==hash) fail(409,'Request ID reused with different data'); return prior; }
 return durableCreate(JSON.stringify(['entity',name,ctx.user.id,data.client_request_id]),hash,
  ()=>db[name].create({...data,request_hash:hash,request_actor_id:ctx.user.id}),id=>db[name].get(id));
}
// A page of trips or messages usually covers several buses. Reading those
// buses one by one cost one database call each, on every refresh of every
// screen; one batched read fills the same request-local cache instead.
async function prefetchParents(db, rows, parents) {
 const ids = { Vehicle: new Set(), Driver: new Set() };
 for (const row of rows) {
  if (row?.vehicle_id) ids.Vehicle.add(row.vehicle_id);
  else if (row?.driver_id) ids.Driver.add(row.driver_id);
 }
 for (const [entity, wanted] of Object.entries(ids)) {
  const missing = [...wanted].filter(id => typeof id === 'string' && !parents.has(entity + ':' + id));
  if (missing.length < 2) continue;
  for (let i = 0; i < missing.length; i += 100) {
   const chunk = missing.slice(i, i + 100);
   const found = await retry429(() => db[entity].filter({ id: { $in: chunk } }, '-created_date', chunk.length, 0));
   const byId = new Map(found.map(row => [row.id, row]));
   for (const id of chunk) parents.set(entity + ':' + id, Promise.resolve(byId.get(id) || null));
  }
 }
}

async function listRows(db, ctx, name, operation, body) {
 if(!Object.hasOwn(ENTITY_FIELDS,name)) fail(403,'Entity access denied');
 if(!ctx.user && name!=='Advertisement') fail(401,'Sign in required');
 const query=cleanQuery(name,operation==='filter' ? body.query||{} : {},ctx.user?.role);
 if(name==='Company' && ctx.user && !['admin','mechanic'].includes(ctx.user.role)) query.id={$in:ctx.companies};
 else if(COMPANY_ENTITIES.has(name) && ctx.user && !['admin','mechanic'].includes(ctx.user.role)) query.company_id={$in:ctx.companies};
 else if(name==='User' && ctx.user?.role!=='admin') query.id=ctx.user.id;
 else if(name==='PushToken' && ctx.user?.role!=='admin') query.email=ctx.user.email;
 if(name==='LostItemReport' && ctx.user?.role!=='admin' && ctx.user?.role!=='company') { delete query.created_by_id; query.reporter_id=ctx.user.id; }
 const limit=Math.min(Math.max(Number(body.limit)||1000,1),5000), skip=Math.max(Number(body.skip)||0,0);
 if(body.sort && !/^-?[A-Za-z_]+$/.test(body.sort)) fail(400,'Invalid sort');
 const rows=await db[name].filter(query,body.sort||'-created_date',limit,skip);
 if (name === 'User' && ctx.user?.role === 'admin' && rows.length) {
  const membershipRows = await db.CompanyMembership.filter(
   {user_id:{$in:rows.map(row=>row.id)},active:true}, '-updated_date', 5000);
  // A capped batch may be incomplete: fall back to the original per-user
  // query at the cap. Below it, keep the same sorted 100-row user limit.
  if (membershipRows.length < 5000) ctx.membershipRows = new Map(
   rows.map(row=>[row.id,membershipRows.filter(m=>m.user_id===row.id).slice(0,100)]));
 }
 if (ctx.user && !['admin','mechanic'].includes(ctx.user.role)) await prefetchParents(db, rows, ctx.parents);
 const result=[];
 for(const row of rows) if(await visible(db,ctx,name,row)) result.push(await projectRecord(db,ctx,name,row));
 return result;
}

export default async function(req) {
 let failureStage='request';
 try {
  const base44=createClientFromRequest(req), db=base44.asServiceRole.entities;
  const body=await req.json(), name=body.entity, operation=body.operation;
  // Refuse unknown or protected entities before looking anything up.
  if(!['Bootstrap','AdminBootstrap','LiveLists'].includes(name) && !Object.hasOwn(ENTITY_FIELDS,name)) fail(403,'Entity access denied');
  failureStage='authentication';
  const ctx=await context(base44);
  failureStage='entity_operation';
  if(ctx.user?.role!=='admin' && ctx.user?.access_role_id) {
   const ownProfile=name==='User' && (operation==='get' && (body.id==='me' || body.id===ctx.user.id) || operation==='update' && body.id===ctx.user.id);
   const ownPush=name==='PushToken' && operation==='register';
   if(!ownProfile && !ownPush)fail(403,'Use your assigned role workspace');
  }
  if(name==='AdminBootstrap') {
   if(!ctx.user) fail(401,'Sign in required');
   if(ctx.user.role!=='admin') fail(403,'Administrators only');
   if(operation!=='list') fail(400,'Read-only operation required');
   if(!Array.isArray(body.datasets) || !body.datasets.length || body.datasets.length>16 ||
      body.datasets.some(k=>typeof k!=='string' || !Object.hasOwn(ADMIN_READ_SPECS,k))) fail(400,'Invalid admin datasets');
   const datasets={},errors={};
   // Sequential storage reads avoid replacing the browser burst with a server burst.
   // Authentication and projection context are reused only inside this request.
   for(const key of new Set(body.datasets)) {
    const spec=ADMIN_READ_SPECS[key];
    try {
     const rows=await retry429(()=>db[spec.entity].filter(spec.query,spec.sort,spec.limit,0));
     if(spec.entity==='User' && rows.length) {
      const memberRows=await retry429(()=>db.CompanyMembership.filter({user_id:{$in:rows.map(r=>r.id)},active:true},'-updated_date',5000));
      if(memberRows.length<5000)ctx.membershipRows=new Map(rows.map(r=>[r.id,memberRows.filter(m=>m.user_id===r.id).slice(0,100)]));
     }
     const out=[];
     for(const row of rows)if(await visible(db,ctx,spec.entity,row))out.push(await projectRecord(db,ctx,spec.entity,row));
     datasets[key]=out;
    } catch(error) {
     const status=error?.status ?? error?.response?.status ?? error?.originalError?.response?.status ?? 500;
     errors[key]={status,error:'Could not load '+key};
     console.error(JSON.stringify({event:'admin_dataset_failed',dataset:key,status}));
    }
   }
   return Response.json({result:{datasets,errors}});
  }
  // Push tokens are credentials: register through this authenticated action,
  // never through client-side credential searches or client-supplied identity.
  if(name==='PushToken' && operation==='register') {
   if(!ctx.user) fail(401,'Sign in required');
   const token=body.data?.token;
   if(typeof token!=='string' || token.length<20 || token.length>4096 || /\s/.test(token)) fail(400,'Invalid notification token');
   const rows=await retry429(()=>db.PushToken.filter({token},'-updated_date',100));
   const data={token,email:ctx.user.email,role:ctx.user.role,company_id:ctx.companies[0]||'',device_id:''};
   // Refresh identity and approved company after sign-in/company changes.
   // A browser token must not keep receiving its previous account's alerts.
   if(rows[0]) {
    await retry429(()=>db.PushToken.update(rows[0].id,data));
    for(const duplicate of rows.slice(1)) await retry429(()=>db.PushToken.delete(duplicate.id));
   } else await retry429(()=>db.PushToken.create(data));
   return Response.json({ok:true});
  }


  // One call for the passenger home: the company's workplace, vehicles, routes
  // and the rides still to come. It used to be four separate calls, and on a
  // phone each one could hit the app's rate limit and then sit waiting to be
  // retried — which is what made the passenger app slow to open.
  if(name==='Bootstrap') {
   if(operation!=='list') fail(400,'Unsupported operation');
   if(!ctx.user) fail(401,'Sign in required');
   const companyId=typeof body.company_id==='string'?body.company_id:'';
   if(!companyId) fail(400,'Company required');
   const [workplaceRows,vehicleRows,routeRows,tripRows]=await Promise.all([
    retry429(()=>db.Workplace.filter({company_id:companyId},'-created_date',50)),
    retry429(()=>db.Vehicle.filter({company_id:companyId},'name',200)),
    retry429(()=>db.Route.filter({company_id:companyId},'name',200)),
    retry429(()=>db.Trip.filter({company_id:companyId,status:{$nin:['completed','cancelled']}},'-scheduled_time',500)),
   ]);
   // The trips' buses were just read above: reuse them instead of one read per trip's bus.
   for(const row of vehicleRows) ctx.parents.set('Vehicle:'+row.id,Promise.resolve(row));
   const projected=async(entity,rows)=>{const out=[];for(const row of rows) if(await visible(db,ctx,entity,row)) out.push(await projectRecord(db,ctx,entity,row));return out;};
   const [workplaces,vehicles,routes,trips]=await Promise.all([
    projected('Workplace',workplaceRows),projected('Vehicle',vehicleRows),projected('Route',routeRows),projected('Trip',tripRows),
   ]);
   return Response.json({result:{workplace:workplaces.find(w=>w.lat!=null&&w.lng!=null)||workplaces[0]||null,vehicles,routes,trips}});
  }
  // Live lists: every list a device is watching, refreshed in one call. Each
  // list goes through exactly the same checks as its own call; only the
  // sign-in and membership lookups are shared, and they were most of the
  // database calls behind every refresh.
  if(name==='LiveLists') {
   if(operation!=='list') fail(400,'Read-only operation required');
   if(!ctx.user) fail(401,'Sign in required');
   const names=body.entities;
   if(!Array.isArray(names) || !names.length || names.length>16 ||
      names.some(n=>typeof n!=='string' || !Object.hasOwn(ENTITY_FIELDS,n))) fail(400,'Invalid lists');
   const lists={},errors={};
   for(const entity of new Set(names)) {
    try { lists[entity]=await listRows(db,ctx,entity,'list',{limit:body.limit}); }
    catch(error) {
     const status=Number(error?.status ?? error?.response?.status ?? error?.originalError?.response?.status) || 500;
     // A busy database: the whole refresh backs off together.
     if(status===429) throw error;
     errors[entity]={status,error:status<500 && error?.message ? error.message : 'Could not load '+entity};
    }
   }
   return Response.json({result:{lists,errors}});
  }
  if(!Object.hasOwn(ENTITY_FIELDS,name)) fail(403,'Entity access denied');
  if(!ctx.user && !(name==='Advertisement' && ['list','filter','get'].includes(operation))) fail(401,'Sign in required');
  if(operation==='get') {
   const row=name==='User' && body.id==='me' ? ctx.user : await db[name].get(body.id);
   if(!row || !(await visible(db,ctx,name,row))) fail(404,'Record not found');
   return Response.json({result:await projectRecord(db,ctx,name,row)});
  }
  if(['list','filter'].includes(operation)) return Response.json({result:await listRows(db,ctx,name,operation,body)});
  if(!['create','update','delete','bulkCreate'].includes(operation)) fail(400,'Unsupported operation');
  if(!ctx.user) fail(401,'Sign in required');
  if(name==='User' && ['create','delete','bulkCreate'].includes(operation) && ctx.user.role!=='admin') fail(403,'Admins only');
  if(operation==='bulkCreate') {
   if(!Array.isArray(body.data) || body.data.length>500) fail(400,'Invalid batch');
   const data=[];
   for(const input of body.data) data.push(await prepare(db,ctx,name,input));
   const result=[];
   for(const item of data) result.push(await projectRecord(db,ctx,name,await replayCreate(db,ctx,name,item)));
   return Response.json({result});
  }
  let existing=null;
  if(['update','delete'].includes(operation)) {
   existing=await db[name].get(body.id);
   if(!existing || !(await visible(db,ctx,name,existing))) fail(404,'Record not found');
  }
  if(operation==='delete') {
   if(ctx.user.role!=='admin'&&MAINTENANCE.has(name))fail(403,'Maintenance deletion is admin-only');
   if(ctx.user.role!=='admin' && !(ctx.user.role==='company' && COMPANY_READ.has(name) && name!=='Company') && !(ctx.user.role==='mechanic' && MAINTENANCE.has(name) && name!=='Vehicle') && !(name==='GroupMessage' && existing.sender_id===ctx.user.id)) fail(403,'Delete forbidden');
   // Deleting an old schedule does not need its now-removed vehicle/company
   // to pass create/update validation. Visibility and admin checks ran above.
   if(name!=='MaintenanceSchedule') await prepare(db,ctx,name,{},existing);
   await db[name].delete(body.id);
   return Response.json({result:{ok:true}});
  }
  const data=await prepare(db,ctx,name,body.data,existing);
  if(name==='User' && ctx.user.role==='admin' && Object.hasOwn(data,'company_id')) {
   await approveMembership(db,{...existing,...data},data.company_id);
  }
  const row=operation==='create' ? await replayCreate(db,ctx,name,data) : await db[name].update(body.id,data);
  return Response.json({result:await projectRecord(db,ctx,name,row)});
 } catch(error) {
  // SDK transport errors may carry their status on response rather than directly.
  // Preserve throttling so clients back off instead of treating it as a server crash.
  const raw=Number(error?.status ?? error?.response?.status ?? error?.originalError?.response?.status);
  const status=Number.isInteger(raw)&&raw>=400&&raw<=599?raw:500;
  if(status===429||status>=500)console.error(JSON.stringify({event:'entity_request_failed',stage:failureStage,status}));
  return Response.json({error:status===429?'Service busy. Please try again shortly.':error.status ? error.message : 'Entity request failed'},
   {status,headers:status===429?{'Retry-After':'30'}:{}});
 }
}