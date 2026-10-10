
import {describe,it,expect} from "vitest";
import {directionView} from "../driverDirection";
import {busOnRoad,nextRoadStopIndex,roadVia} from "../roadStops";
const data=()=>({
 vehicle:{id:"bus",trip_direction:"to_work"},
 workplace:{name:"Company",lat:12,lng:-61.74},
 route:{id:"route",stops:[{name:"A",order:0,lat:12,lng:-61.76},{name:"B",order:1,lat:12,lng:-61.75}],
 path:[{lat:12,lng:-61.76},{lat:12,lng:-61.75},{lat:12,lng:-61.74}],
 path_via:[{lat:12,lng:-61.76},{lat:12,lng:-61.75},{lat:12,lng:-61.74}]},
 road_stops:{stops:[{key:"a",name:"A",lat:12,lng:-61.758,along:200,riders:[]},{key:"b",name:"B",lat:12,lng:-61.745,along:1600,riders:[]}]},
 staff:[{id:"pat",pickup_name:"Pat's home stop",home_lat:12,home_lng:-61.758}]
});
describe("driver direction view",()=>{
 it("reverses roads, via points and stops without changing saved passenger or route data",()=>{
  const raw=data(); raw.vehicle.trip_direction="to_home";const original=structuredClone(raw);
  const home=directionView(raw);
  expect(home.route.stops.map(s=>s.name)).toEqual(["B","A"]);
  expect(home.route.stops.map(s=>s.order)).toEqual([0,1]);
  expect(home.route.path).toEqual([...raw.route.path].reverse());
  expect(home.route.path_via).toEqual([...raw.route.path_via].reverse());
  expect(home.road_stops.stops.map(s=>s.key)).toEqual(["b","a"]);
  expect(home.staff[0]).toMatchObject({dropoff_name:"Pat's home stop",dropoff_lat:12,dropoff_lng:-61.758});
  expect(raw).toEqual(original);
  expect(directionView({...raw,vehicle:{trip_direction:"to_work"}}).route.stops.map(s=>s.name)).toEqual(["A","B"]);
 });
 it("progress and via points advance in the return direction",()=>{
  const raw=data();raw.vehicle.trip_direction="to_home";const home=directionView(raw);
  expect(home.road_stops.stops[0].along).toBeLessThan(home.road_stops.stops[1].along);
  expect(nextRoadStopIndex(home.road_stops.stops,busOnRoad(home.route,12,-61.747))).toBe(1);
  expect(roadVia(home.route,0,2000)).toEqual([{lat:12,lng:-61.75}]);
 });
 it("defaults existing buses to work and does not invent missing locations",()=>{
  const raw=data();delete raw.vehicle.trip_direction;
  expect(directionView(raw).staff[0].dropoff_name).toBe("Company");
  raw.workplace=null;
  expect(directionView(raw).staff[0].dropoff_lat).toBeNull();
  expect(directionView(null)).toBeNull();
 });
});
