import { checkBusPin } from '../../shared/busPin.ts';
import { notifyJobProgress } from '../../shared/jobNotifications.ts';
import { forwardToSupabase } from '../../shared/forwardToSupabase.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guestTrip, signJob, tabletTrip, jobForBus } from '../../shared/jobSignature.ts';

// The signing tablet: a guest-facing tablet on a bus, used only to sign for a
// job at pickup and at drop-off. It is a paired tablet (no login), accepted
// only with its own current device token, and it can do nothing else: no
// passenger lists, no boarding, no driver tools.

async function digestHex(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}
function sameHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
// Signing tablets came after device tokens, so only a current token counts
// (there is no older, tokenless way in).
async function signingTablet(base44, deviceId, token) {
  if (!deviceId || typeof deviceId !== 'string' || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  const device = await base44.asServiceRole.entities.KioskDevice.get(deviceId).catch((e) => {
    if ([400, 404].includes(e?.status ?? e?.response?.status)) return null;
    throw e;
  });
  if (!device || device.kiosk_type !== 'job_signing' || !device.paired || device.status !== 'active' || !device.vehicle_id) return null;
  const [credential] = await base44.asServiceRole.entities.DeviceCredential.filter({ device_id: device.id }, '-issued_at', 1);
  if (!credential || !(Date.parse(credential.expires_at) > Date.now())) return null;
  if (credential.company_id !== device.company_id || credential.vehicle_id !== (device.vehicle_id || '') || credential.kiosk_type !== device.kiosk_type) return null;
  if (!sameHex(credential.pairing_code_hash, await digestHex(device.pairing_code || ''))) return null;
  return sameHex(credential.token_hash, await digestHex(token)) ? device : null;
}

export default async function(req) {
  // After the switch, calls from the installed tablet app go on to Supabase.
  const forwarded = await forwardToSupabase(req, 'jobSigning');
  if (forwarded) return forwarded;
  try {
    const body = await req.json().catch(() => ({}));
    const base44 = createClientFromRequest(req);
    const device = await signingTablet(base44, body.device_id, body.device_token);
    if (!device) return Response.json({ error: 'Invalid or unpaired signing tablet', code: 'DEVICE_ACCESS_REQUIRED' }, { status: 401 });
    const companyId = device.company_id, vehicleId = device.vehicle_id;

    // Saved while offline: only for the tablet and bus it was saved on.
    if (body.queue_replay && (body.expected_device_id !== device.id || body.expected_company_id !== companyId || body.expected_vehicle_id !== vehicleId))
      return Response.json({ error: 'Saved work belongs to a different tablet assignment' }, { status: 409 });


    const db=base44.asServiceRole.entities;
    if(body.action==='unlock_operator') {
      const vehicle=await db.Vehicle.get(vehicleId);
      if(!vehicle || vehicle.company_id!==companyId)return Response.json({error:'Bus assignment changed'},{status:403});
      const result=await checkBusPin(base44,vehicle,body.pin);
      if(result!=='ok')return Response.json({error:result==='locked'?'Too many PIN attempts. Try again later.':'Incorrect bus PIN'},{status:result==='locked'?429:403});
      const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
      await db.VerificationGrant.create({token_hash:await digestHex(token),device_id:device.id,company_id:companyId,vehicle_id:vehicleId,purpose:'signing_operator',subject:vehicleId,pairing_code_hash:await digestHex(device.pairing_code||''),expires_at:new Date(Date.now()+10*60000).toISOString()});
      return Response.json({operator_grant:token});
    }
    if(['operator_state','arrive','list_buses','change_bus'].includes(body.action)) {
      if(typeof body.operator_grant!=='string' || !/^[a-f0-9]{64}$/.test(body.operator_grant))return Response.json({error:'Enter the bus PIN first'},{status:403});
      const [grant]=await db.VerificationGrant.filter({token_hash:await digestHex(body.operator_grant)},'-created_date',1);
      if(!grant || grant.purpose!=='signing_operator' || grant.device_id!==device.id || grant.vehicle_id!==vehicleId || grant.company_id!==companyId || grant.pairing_code_hash!==await digestHex(device.pairing_code||'') || !(Date.parse(grant.expires_at)>Date.now()))return Response.json({error:'Operator access expired. Enter the bus PIN again.'},{status:403});
      // Moving the tablet to another bus of the same company: staff unlock it
      // with this bus's PIN, pick the bus, and give that bus's PIN too. The
      // tablet and its credential move together, so it stays paired.
      if(body.action==='list_buses') {
        const rows=await db.Vehicle.filter({company_id:companyId},'name',300);
        return Response.json({current:vehicleId,buses:rows.filter(v=>v.company_id===companyId&&v.in_service!==false).map(v=>({id:v.id,name:v.name||'Bus',plate_number:v.plate_number||''}))});
      }
      if(body.action==='change_bus') {
        if(typeof body.vehicle_id!=='string' || !/^[A-Za-z0-9_-]{1,64}$/.test(body.vehicle_id))return Response.json({error:'Choose a bus'},{status:400});
        if(body.vehicle_id===vehicleId)return Response.json({error:'This tablet is already on that bus'},{status:409});
        const next=await db.Vehicle.get(body.vehicle_id).catch(()=>null);
        if(!next || next.company_id!==companyId)return Response.json({error:'That bus was not found'},{status:404});
        if(next.in_service===false)return Response.json({error:`${next.name||'That bus'} is not in service`},{status:409});
        const result=await checkBusPin(base44,next,body.pin);
        if(result!=='ok')return Response.json({error:result==='locked'?'Too many PIN attempts. Try again later.':`Incorrect PIN for ${next.name||'that bus'}`},{status:result==='locked'?429:403});
        const [credential]=await db.DeviceCredential.filter({device_id:device.id},'-issued_at',1);
        if(!credential)return Response.json({error:'Pair this tablet again',code:'DEVICE_ACCESS_REQUIRED'},{status:401});
        // The old bus's name card doesn't follow the tablet.
        await db.KioskDevice.update(device.id,{vehicle_id:next.id,vehicle_name:next.name||'',pickup_sign:null});
        try { await db.DeviceCredential.update(credential.id,{vehicle_id:next.id}); }
        catch(error) { await db.KioskDevice.update(device.id,{vehicle_id:vehicleId,vehicle_name:device.vehicle_name||''}); throw error; }
        // The new bus's PIN was just given, so the controls stay open.
        const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
        await db.VerificationGrant.create({token_hash:await digestHex(token),device_id:device.id,company_id:companyId,vehicle_id:next.id,purpose:'signing_operator',subject:next.id,pairing_code_hash:await digestHex(device.pairing_code||''),expires_at:new Date(Date.now()+10*60000).toISOString()});
        return Response.json({bus:{id:next.id,name:next.name||''},operator_grant:token});
      }
      if(body.action==='operator_state') {
        const rows=await db.Trip.filter({vehicle_id:vehicleId,status:{$in:['scheduled','on_the_way','arrived']}},'scheduled_time',100);
        return Response.json({jobs:rows.filter(t=>t.company_id===companyId).map(tabletTrip)});
      }
      const {trip,reply}=await jobForBus(base44,body,companyId,vehicleId);
      if(reply)return reply;
      if(body.stage==='pickup') {
        if(trip.status!=='on_the_way' || trip.pickup_signed_at)return Response.json({error:'This job is not waiting at pickup'},{status:409});
        if(trip.pickup_arrived_at)return Response.json({trip:guestTrip(trip)});
        const updated=await db.Trip.update(trip.id,{pickup_arrived_at:new Date().toISOString()});
        await notifyJobProgress(base44,updated,'pickup_arrived');
        return Response.json({trip:guestTrip(updated)});
      }
      if(body.stage!=='dropoff' || !trip.pickup_signed_at || !['on_the_way','arrived'].includes(trip.status))return Response.json({error:'Confirm pickup before arriving at drop-off'},{status:409});
      if(trip.status==='arrived')return Response.json({trip:guestTrip(trip)});
      const updated=await db.Trip.update(trip.id,{status:'arrived',arrived_at:new Date().toISOString()});
      await notifyJobProgress(base44,updated,'arrived');
      return Response.json({trip:guestTrip(updated)});
    }

    switch (body.action) {
      case 'state': {
        // Only jobs under way, as guests may see them: the screen asks for a
        // signature when a job has started (pickup) or arrived (drop-off).
        // Later groups' names and flights never reach this tablet.
        const rows = await base44.asServiceRole.entities.Trip.filter({ vehicle_id: vehicleId, status: { $in: ['on_the_way', 'arrived'] } }, 'scheduled_time', 20);
        return Response.json({
          bus: { id: vehicleId, name: device.vehicle_name || '' }, company_name: device.company_name || '',
          jobs: rows.filter((t) => t.company_id === companyId).map(guestTrip),
        });
      }
      case 'sign':
        return signJob(base44, body, companyId, vehicleId, guestTrip);
      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    const status = Number(error?.status ?? error?.response?.status) || 500;
    if (status === 429) return Response.json({ error: 'Server is busy. Please try again shortly.' }, { status: 429 });
    return Response.json({ error: status < 500 && error?.message ? error.message : 'Signing request failed' }, { status: status >= 400 && status <= 599 ? status : 500 });
  }
}
