export const ROLE_SECTIONS = {
  "fleet": {
    "label": "Live fleet",
    "entity": "Vehicle",
    "fields": [
      "name",
      "plate_number",
      "company_name",
      "driver_name",
      "status",
      "current_lat",
      "current_lng",
      "speed",
      "last_location_update"
    ]
  },
  "jobs": {
    "label": "Jobs and trips",
    "entity": "Trip",
    "fields": [
      "vehicle_name",
      "company_name",
      "passenger_name",
      "pickup_name",
      "dropoff_name",
      "scheduled_time",
      "status"
    ]
  },
  "routes": {
    "label": "Routes and stops",
    "entity": "Route",
    "fields": [
      "name",
      "company_name",
      "type",
      "active",
      "stops"
    ]
  },
  "schedule": {
    "label": "Maintenance schedule",
    "entity": "MaintenanceSchedule",
    "fields": [
      "vehicle_name",
      "company_name",
      "service_type",
      "status",
      "due_type",
      "interval_km",
      "interval_days",
      "last_service_date",
      "notes"
    ]
  },
  "faults": {
    "label": "Faults",
    "entity": "Fault",
    "fields": [
      "vehicle_name",
      "company_name",
      "title",
      "description",
      "severity",
      "status"
    ]
  },
  "parts": {
    "label": "Parts inventory",
    "entity": "Part",
    "fields": [
      "part_name",
      "company_name",
      "oem_number",
      "category",
      "quantity_in_stock",
      "unit_price"
    ]
  },
  "inspections": {
    "label": "Inspections",
    "entity": "Inspection",
    "fields": [
      "vehicle_name",
      "company_name",
      "driver_name",
      "date",
      "status",
      "odometer_reading",
      "needs_service",
      "service_notes"
    ]
  },
  "drivers": {
    "label": "Drivers",
    "entity": "Driver",
    "fields": [
      "full_name",
      "company_name",
      "email",
      "phone",
      "employee_id"
    ]
  },
  "companies": {
    "label": "Companies",
    "entity": "Company",
    "fields": [
      "name",
      "phone",
      "description",
      "service_types"
    ]
  },
  "passengers": {
    "label": "Passenger directory",
    "entity": "Contact",
    "fields": [
      "name",
      "company_name",
      "email",
      "phone",
      "vehicle_name",
      "pickup_name",
      "dropoff_name"
    ]
  },
  "users": {
    "label": "Users",
    "entity": "User",
    "fields": [
      "full_name",
      "display_name",
      "email",
      "role",
      "employee_id"
    ]
  },
  "messages": {
    "label": "Bus messages",
    "entity": "GroupMessage",
    "fields": [
      "vehicle_name",
      "company_name",
      "channel",
      "sender_name",
      "text",
      "message_type",
      "media_url"
    ]
  },
  "checkins": {
    "label": "Boarding history",
    "entity": "StaffCheckIn",
    "fields": [
      "staff_name",
      "company_name",
      "vehicle_name",
      "status",
      "boarded_at"
    ]
  },
  "kiosks": {
    "label": "Kiosk devices",
    "entity": "KioskDevice",
    "fields": [
      "label",
      "company_name",
      "vehicle_name",
      "kiosk_type",
      "status",
      "last_seen"
    ]
  },
  "billing": {
    "label": "Billing",
    "entity": "Invoice",
    "fields": [
      "invoice_number",
      "client_name",
      "total",
      "status",
      "issued_at"
    ]
  }
};
export function roleSections(value) {
 if (!Array.isArray(value) || value.some(key => typeof key !== 'string' || !Object.hasOwn(ROLE_SECTIONS,key)))
  throw Object.assign(new Error('Choose valid screens'),{status:400});
 return [...new Set(value)];
}
export async function assignedAccessRole(db, user) {
 if (!user || user.role === 'admin' || !user.access_role_id) return null;
 const [assignment] = await db.RoleAssignment.filter({user_id:user.id},'-updated_date',1);
 if (!assignment?.role_id) return null;
 const role = await db.AccessRole.get(assignment.role_id).catch(error => {
  if ((error.status ?? error.response?.status) === 404) return null;
  throw error;
 });
 // A removed or disabled role has no fallback to broader access.
 return {id:assignment.role_id,name:role?.name || 'Role unavailable',
  sections:role?.active !== false && role ? roleSections(role.sections || []) : []};
}
export function safeRoleRecord(row, spec) {
 const fields=['id','created_date',...spec.fields];
 return Object.fromEntries(fields.filter(key=>row[key] !== undefined).map(key=>[key,row[key]]));
}
