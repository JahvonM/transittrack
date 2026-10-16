import { describe, it, expect } from "vitest";
import { digest, load, mock, request } from "../../../security-tests/helpers.js";
import { boardingLayout, rememberKioskLayout } from "@/lib/kioskLayout";
it("deletes an orphaned QA schedule without validating its deleted vehicle or company",async()=>{
 const sdk=mock("admin");
 sdk.tables.MaintenanceSchedule=[{id:"qa",service_type:"QA test",company_id:"removed",vehicle_id:"removed"}];
 const api=load("entityAccess",sdk).default;
 const res=await api(request({entity:"MaintenanceSchedule",operation:"delete",id:"qa"}));
 expect(res.status).toBe(200);expect(sdk.tables.MaintenanceSchedule).toEqual([]);
 expect(sdk.reads.some(r=>r.name==="Company" || r.name==="Vehicle")).toBe(false);
});
it.each(["staff","company","mechanic"])("does not let %s delete a schedule",async role=>{
 const sdk=mock(role);sdk.tables.MaintenanceSchedule=[{id:"qa",service_type:"QA",company_id:"a",vehicle_id:"bus-a"}];
 const response=await load("entityAccess",sdk).default(request({entity:"MaintenanceSchedule",operation:"delete",id:"qa"}));
 expect([403,404]).toContain(response.status);expect(sdk.writes).toEqual([]);
});
it("respects selected phone and tablet layouts and defaults by screen size",()=>{
 expect(boardingLayout("auto",null,390)).toBe("phone");
 expect(boardingLayout("auto","phone",1200)).toBe("phone");
 expect(boardingLayout("tablet","phone",390)).toBe("tablet");
 expect(boardingLayout("phone","tablet",1200)).toBe("phone");
 const storage={setItem:(key,value)=>{storage[key]=value;}};
 rememberKioskLayout("phone",storage);expect(storage.tt_kiosk_layout).toBe("phone");
});
async function driverSetup(){
 const sdk=mock(null);sdk.tables.KioskDevice[0].kiosk_type="driver";
 sdk.tables.Trip=[{id:"job",company_id:"a",vehicle_id:"bus-a",status:"scheduled",passenger_name:"Guest Name",client_name:"Hotel"}];
 sdk.tables.KioskDevice.push({id:"boarding",paired:true,status:"active",kiosk_type:"bus_boarding",company_id:"a",vehicle_id:"bus-a"},
  {id:"other",paired:true,status:"active",kiosk_type:"bus_boarding",company_id:"b",vehicle_id:"bus-a"},
  {id:"unpaired",paired:false,status:"active",kiosk_type:"bus_boarding",company_id:"a",vehicle_id:"bus-a"});
 const api=load("driverSession",sdk,["issueGrant"]);
 const grant=await api.issueGrant(sdk,sdk.tables.KioskDevice[0],"driver","bus-a",60000);
 const send=body=>api.default(request({device_id:"tablet",driver_grant:grant,...body}));
 return {sdk,send};
}
it("sends pickup signs only to the bus's paired guest-facing devices",async()=>{
 const {sdk,send}=await driverSetup();
 const response=await send({action:"show_pickup_sign",trip_id:"job"});
 expect(response.status).toBe(200);
 expect((await response.json()).devices).toBe(1);
 expect(sdk.tables.KioskDevice.find(d=>d.id==="boarding").pickup_sign).toMatchObject({name:"Guest Name",subtitle:"Hotel"});
 for(const id of ["tablet","other","unpaired"])expect(sdk.tables.KioskDevice.find(d=>d.id===id).pickup_sign).toBeUndefined();
});
it("requires the driver PIN grant and refuses another bus's pickup sign",async()=>{
 const {sdk,send}=await driverSetup();
 expect((await send({action:"show_pickup_sign",trip_id:"job",driver_grant:""})).status).toBe(401);
 sdk.tables.Trip[0].vehicle_id="bus-b";
 expect((await send({action:"show_pickup_sign",trip_id:"job"})).status).toBe(403);
});
it("reads only this bus/company's chats without loading passenger or inspection lists",async()=>{
 const {sdk,send}=await driverSetup();
 sdk.tables.GroupMessage=[{id:"a",vehicle_id:"bus-a",company_id:"a",text:"Hello"},{id:"b",vehicle_id:"bus-a",company_id:"b",text:"Private"}];
 const response=await send({action:"messages"});
 expect(response.status).toBe(200);expect((await response.json()).group_messages.map(m=>m.id)).toEqual(["a"]);
 expect(sdk.reads.filter(r=>["Contact","Inspection","InspectionTemplate","CompanyMembership"].includes(r.name))).toEqual([]);
});
