import { beforeEach, describe, expect, it } from "vitest";
import { installMemoryStorage } from "./memoryStorage";
import { busRefusal, burnOneTimeCode, offlineLookup, saveDevice, saveDirectory } from "@/lib/kioskOffline";

const BUS = "bus-12";
const people = [
  { id: "p1", full_name: "Tanya Brown", nfc_tag: "04:A1:B2", access_code: "11111", vehicle_id: BUS, vehicle_name: "Bus 12" },
  { id: "p2", full_name: "Kevin Paul", nfc_tag: "04C3D4", access_code: "22222", vehicle_id: "bus-7", vehicle_name: "Bus 7" },
  { id: "p3", full_name: "Lisa Noel", nfc_tag: "04E5F6", access_code: "", vehicle_id: "", vehicle_name: "" },
  { id: "p4", full_name: "Ryan B", nfc_tag: "", access_code: "", one_time_code: "98765", one_time_code_expires_at: new Date(Date.now() + 60000).toISOString(), vehicle_id: BUS },
];

beforeEach(() => {
  installMemoryStorage();
  saveDevice({ device_id: "k1", vehicle_id: BUS, vehicle_name: "Bus 12" });
  saveDirectory({ generated_at: new Date().toISOString(), staff: people.map((p) => ({ ...p })) });
});

describe("busRefusal (card only works on the passenger's own bus)", () => {
  it("lets people on their own bus", () => {
    expect(busRefusal(people[0], BUS)).toBeNull();
  });
  it("refuses another bus's passenger and names their bus", () => {
    expect(busRefusal(people[1], BUS)).toEqual({ error: "wrong_bus", message: "Kevin Paul rides Bus 7, not this one." });
  });
  it("refuses someone with no bus yet", () => {
    expect(busRefusal(people[2], BUS)?.error).toBe("no_bus");
  });
  it("doesn't judge an old saved list that has no bus info", () => {
    expect(busRefusal({ id: "x", full_name: "Old" }, BUS)).toBeNull();
  });
});

describe("offlineLookup", () => {
  it("finds a card however the reader formats it", () => {
    const res = offlineLookup("lookup_tag", { card_tag: "04a1b2" });
    expect(res.staff).toEqual({ id: "p1", full_name: "Tanya Brown", photo_url: undefined });
    expect(res.next_status).toBe("boarded");
    expect(res.offline).toBe(true);
  });

  it("refuses a card from another bus with a clear message", () => {
    expect(() => offlineLookup("lookup_tag", { card_tag: "04C3D4" })).toThrow(expect.objectContaining({
      response: { status: 403, data: { error: "wrong_bus", message: "Kevin Paul rides Bus 7, not this one." } },
    }));
  });

  it("says when a card isn't registered", () => {
    expect(() => offlineLookup("lookup_tag", { card_tag: "FFFF" })).toThrow(expect.objectContaining({ response: expect.objectContaining({ status: 404 }) }));
  });

  it("accepts keypad codes and one-time codes, once", () => {
    expect(offlineLookup("lookup_code", { code: "11111" }).code_type).toBe("access");
    expect(offlineLookup("lookup_code", { code: "98765" }).code_type).toBe("one_time");
    burnOneTimeCode("p4");
    expect(() => offlineLookup("lookup_code", { code: "98765" })).toThrow();
  });

  it("has nothing to answer from before the list is saved", () => {
    localStorage.clear();
    expect(offlineLookup("lookup_tag", { card_tag: "04A1B2" })).toBeNull();
  });
});
