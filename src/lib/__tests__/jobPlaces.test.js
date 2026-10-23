import { describe, expect, it } from "vitest";
import { orderedJobPlaces } from "../jobPlaces";

describe("saved job places", () => {
  it("shows favourites first without mutating the fetched order", () => {
    const places = [{id:"b",name:"Hotel",favorite:false},{id:"a",name:"Airport",favorite:true},{id:"c",name:"Taxi stand",favorite:true}];
    expect(orderedJobPlaces(places).map(p=>p.name)).toEqual(["Airport","Taxi stand","Hotel"]);
    expect(places[0].name).toBe("Hotel");
  });
  it("supports legacy saved places without a favourite field", () => {
    expect(orderedJobPlaces([{name:"Zulu"},{name:"Alpha"}]).map(p=>p.name)).toEqual(["Alpha","Zulu"]);
  });
});
