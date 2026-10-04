import { describe, it, expect, vi, afterEach } from "vitest";
import { load, mock, request } from "../../../security-tests/helpers.js";
import { cardArtwork, CARD_PX, CARD_MM } from "@/lib/cardArtwork";
vi.mock("@/lib/mapbox",()=>({ MAPBOX_TOKEN:"test" }));
vi.mock("@/lib/geo",()=>({fetchDrivingRoute:vi.fn()}));
import { fetchDrivingRoute } from "@/lib/geo";
import { nearestRoutePoint, suggestPickup } from "@/lib/pickupSuggestion";
const call=(sdk,body,name="nfcCards")=>load(name,sdk).default(request(body));
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
describe("email account directory",()=>{
 it("shows unassigned email passengers to admin without duplicating records or exposing credentials",async()=>{
  const sdk=mock("admin");
  sdk.tables.User.push({id:"email-user",role:"passenger",email:"new@test.invalid",full_name:"New Passenger",company_id:"b",nfc_tag_id:"SECRETUID",access_code:"SECRETCODE"});
  const res=await call(sdk,{action:"directory"});
  const {people}=await res.json();
  expect(people.find(p=>p.key==="user:email-user")).toMatchObject({name:"New Passenger",company_id:"",registered:true});
  expect(JSON.stringify(people)).not.toMatch(/SECRETUID|SECRETCODE|card_uid/);
  expect(sdk.writes).toEqual([]);
 });
 it("includes approved passengers for their manager and ignores spoofed profile company",async()=>{
  const sdk=mock("company");
  sdk.tables.User.push({id:"email-user",role:"passenger",email:"new@test.invalid",full_name:"New Passenger",company_id:"b"});
  sdk.tables.CompanyMembership.push({id:"p",user_id:"email-user",company_id:"a",scope:"passenger",active:true});
  expect((await (await call(sdk,{action:"directory"})).json()).people.some(p=>p.key==="user:email-user")).toBe(true);
  sdk.tables.CompanyMembership[1].active=false;
  expect((await (await call(sdk,{action:"directory"})).json()).people.some(p=>p.key==="user:email-user")).toBe(false);
 });
 it("merges same-company contact and login without adding a second passenger",async()=>{
  const sdk=mock("staff");sdk.tables.User[0].role="passenger";sdk.auth.me=async()=>({id:"admin",role:"admin"});
  const {people}=await (await call(sdk,{action:"directory"})).json();
  expect(people.filter(p=>p.email==="caller@test.invalid")).toHaveLength(1);
  expect(people[0].registered).toBe(true);
 });
 it("recognizes an account card when a same-company contact also exists", async()=>{
  const sdk=mock("staff"); sdk.tables.User[0].role="passenger"; sdk.auth.me=async()=>({id:"admin",role:"admin"});
  sdk.tables.NfcCard=[{id:"existing-card",holder_source:"user",holder_id:"caller",company_id:"a",is_active:true,card_uid:"SECRETUID"}];
  const {people}=await (await call(sdk,{action:"directory"})).json();
  expect(people.find(p=>p.email==="caller@test.invalid")).toMatchObject({key:"user:caller",status:"Card Issued"});
  expect(JSON.stringify(people)).not.toContain("SECRETUID");
 });
 it("lets a passenger verify the company code but never grants a manager role",async()=>{
  const sdk=mock("passenger");
  const res=await call(sdk,{action:"verify",code:"JOIN12345678"},"companyAccess");
  expect(res.status).toBe(200);
  expect(sdk.tables.User[0].role).toBe("passenger");
  expect(sdk.tables.CompanyMembership.some(m=>m.active && m.scope==="passenger" && m.company_id==="a")).toBe(true);
 });
 it("issues a card to an approved email passenger and verifies it at the company tablet",async()=>{
  const sdk=mock("admin");sdk.tables.Contact=[];
  sdk.tables.User.push({id:"email-user",role:"passenger",email:"new@test.invalid",full_name:"New Passenger"});
  sdk.tables.CompanyMembership.push({id:"p",user_id:"email-user",company_id:"a",scope:"passenger",active:true});
  const issued=await call(sdk,{action:"issue",person_key:"user:email-user",uid:"AABBCCDD"});
  expect(issued.status).toBe(200);
  await call(sdk,{action:"set_bus",person_key:"user:email-user",vehicle_id:"bus-a"});
  sdk.tables.User.find(u=>u.id==="email-user").vehicle_id="bus-b"; // Self-edit cannot change the trusted assignment.
  sdk.auth.me=async()=>null;
  const lookup=await call(sdk,{action:"lookup_tag",device_id:"tablet",card_tag:"AABBCCDD"},"kioskCheckIn");
  expect(lookup.status).toBe(200);
  expect((await lookup.json()).staff.id).toBe("email-user");
 });
 it("keeps an email passenger's identity and card when assigning a bus",async()=>{
  const sdk=mock("admin");sdk.tables.Contact=[];
  sdk.tables.User.push({id:"email-user",role:"passenger",email:"new@test.invalid",full_name:"New Passenger"});
  sdk.tables.CompanyMembership.push({id:"p",user_id:"email-user",company_id:"a",scope:"passenger",active:true});
  await call(sdk,{action:"issue",person_key:"user:email-user",uid:"AABBCCDD"});
  const res=await call(sdk,{action:"set_bus",person_key:"user:email-user",vehicle_id:"bus-a"});
  expect((await res.json()).person_key).toBe("user:email-user");
  expect(sdk.tables.Contact).toEqual([]);
  expect(sdk.tables.NfcCard[0]).toMatchObject({holder_source:"user",holder_id:"email-user",is_active:true});
  expect(sdk.tables.CompanyMembership.find(m=>m.user_id==="email-user").vehicle_id).toBe("bus-a");
 });
 it("rejects issuing a card to an unassigned account",async()=>{
  const sdk=mock("admin");sdk.tables.User.push({id:"new",role:"passenger",email:"new@test.invalid"});
  expect((await call(sdk,{action:"issue",person_key:"user:new",uid:"AABBCCDD"})).status).toBe(403);
  expect(sdk.writes).toEqual([]);
 });
 it("validates own pickup coordinates and rejects a route in another company",async()=>{
  const sdk=mock("passenger");sdk.tables.Route=[{id:"foreign",company_id:"b"}];
  expect((await call(sdk,{entity:"User",operation:"update",id:"caller",data:{pickup_lat:999,pickup_lng:-61}},"entityAccess")).status).toBe(400);
  expect((await call(sdk,{entity:"User",operation:"update",id:"caller",data:{pickup_lat:12,pickup_lng:-61,pickup_route_id:"foreign"}},"entityAccess")).status).toBe(403);
  expect(sdk.writes).toEqual([]);
 });
});
describe("roadside walking suggestion",()=>{
 const road=[[ -61.7,12 ],[-61.7,12.01]];
 it("projects onto the actual bus-road geometry",()=>{
  const p=nearestRoutePoint({lat:12.005,lng:-61.701},road);
  expect(p.lng).toBeCloseTo(-61.7);expect(p.lat).toBeCloseTo(12.005);expect(p.distanceM).toBeGreaterThan(90);
 });
 it("refuses an unreachable walking destination instead of inventing a stop",async()=>{
  fetchDrivingRoute.mockResolvedValue({geometry:road});
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({routes:[]})}));
  expect(await suggestPickup({lat:12.005,lng:-61.701},[{id:"r",name:"Bus route",stops:[{lat:12,lng:-61.7},{lat:12.01,lng:-61.7}]}])).toBeNull();
 });
 it("returns walking instructions to a bus-road point",async()=>{
  fetchDrivingRoute.mockResolvedValue({geometry:road});
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({routes:[{distance:120,duration:90,geometry:{coordinates:[[-61.701,12.005],[-61.7,12.005]]},legs:[{steps:[{mode:"walking",maneuver:{instruction:"Walk east"}}]}]}],waypoints:[{}, {location:[-61.7,12.005]}]})}));
  const p=await suggestPickup({lat:12.005,lng:-61.701},[{id:"r",name:"Bus route",stops:[{lat:12,lng:-61.7},{lat:12.01,lng:-61.7}]}]);
  expect(p).toMatchObject({route_id:"r",walkM:120,steps:["Walk east"]});
 });
});
describe("printable card artwork",()=>{
 it("escapes names and never embeds NFC credentials",()=>{
  const svg=cardArtwork({title:'<script>bad</script>'},{name:'<img onerror="bad">',card_uid:"SECRETUID",access_code:"SECRETCODE"});
  expect(svg).not.toMatch(/<script>|<img|SECRETUID|SECRETCODE/);
  expect(svg).toContain("&lt;script&gt;");
  expect(CARD_PX).toEqual({width:1011,height:638});
  expect(CARD_MM).toEqual({width:85.6,height:53.98});
 });
 it("rejects active SVG uploads and unsafe color values",()=>{
  const svg=cardArtwork({logo:"data:image/svg+xml;base64,PHN2Zz4=",color:'red" onload="bad'},{name:"Passenger"});
  expect(svg).not.toContain("onload");expect(svg).not.toContain("data:image/svg");
 });
});
