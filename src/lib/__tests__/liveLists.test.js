import { it, expect, vi, afterEach } from "vitest";
import { scopedEntities, FAST_POLL_MS, ACTIVE_POLL_MS, FIRST_POLL_MS } from "@/lib/scopedEntities";
import { load, mock, request } from "../../../security-tests/helpers.js";

afterEach(() => { vi.useRealTimers(); });

const liveLists = (lists, errors = {}) => ({ data: { result: { lists, errors } } });

it("refreshes every list a device watches in one call", async () => {
  vi.useFakeTimers();
  let bus = 1;
  const invoke = vi.fn(async (_name, body) => liveLists(Object.fromEntries(body.entities.map((e) => [e, e === "Vehicle" ? [{ id: "bus", v: bus }] : [{ id: e }]]))));
  const entities = scopedEntities({ functions: { invoke } });
  const seen = vi.fn();
  const stops = [entities.Vehicle.subscribe(seen), entities.Trip.subscribe(() => {}), entities.GroupMessage.subscribe(() => {})];
  await vi.advanceTimersByTimeAsync(FIRST_POLL_MS);
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(invoke.mock.calls[0][1]).toMatchObject({ entity: "LiveLists", operation: "list" });
  expect(invoke.mock.calls[0][1].entities.sort()).toEqual(["GroupMessage", "Trip", "Vehicle"]);
  // Buses are due first; the other lists, due soon after, ride along.
  bus = 2;
  await vi.advanceTimersByTimeAsync(FAST_POLL_MS);
  expect(invoke).toHaveBeenCalledTimes(2);
  expect(invoke.mock.calls[1][1].entities.sort()).toEqual(["GroupMessage", "Trip", "Vehicle"]);
  expect(seen).toHaveBeenCalledWith({ type: "update", id: "bus", data: { id: "bus", v: 2 } });
  // One call per refresh, however many lists: about 3 a minute, not one per list.
  await vi.advanceTimersByTimeAsync(60000);
  expect(invoke.mock.calls.length).toBeLessThanOrEqual(5);
  stops.forEach((stop) => stop());
  const before = invoke.mock.calls.length;
  await vi.advanceTimersByTimeAsync(ACTIVE_POLL_MS * 4);
  expect(invoke).toHaveBeenCalledTimes(before);
});

it("a list the server refuses stops; the others carry on", async () => {
  vi.useFakeTimers();
  const invoke = vi.fn(async (_name, body) => liveLists(
    Object.fromEntries(body.entities.filter((e) => e !== "Fault").map((e) => [e, []])),
    body.entities.includes("Fault") ? { Fault: { status: 403 } } : {},
  ));
  const entities = scopedEntities({ functions: { invoke } });
  entities.Vehicle.subscribe(() => {});
  entities.Fault.subscribe(() => {});
  await vi.advanceTimersByTimeAsync(FIRST_POLL_MS);
  await vi.advanceTimersByTimeAsync(FAST_POLL_MS);
  expect(invoke).toHaveBeenCalledTimes(2);
  expect(invoke.mock.calls[1][1].entities).toEqual(["Vehicle"]);
});

it("an older server without the one-call refresh: each list refreshes on its own", async () => {
  vi.useFakeTimers();
  const invoke = vi.fn(async (_name, body) => {
    if (body.entity === "LiveLists") throw { status: 403 };
    return { data: { result: [{ id: body.entity }] } };
  });
  const entities = scopedEntities({ functions: { invoke } });
  entities.Vehicle.subscribe(() => {});
  entities.Trip.subscribe(() => {});
  await vi.advanceTimersByTimeAsync(FIRST_POLL_MS);
  expect(invoke.mock.calls.map((c) => c[1].entity)).toEqual(["LiveLists", "Vehicle", "Trip"]);
  await vi.advanceTimersByTimeAsync(FAST_POLL_MS);
  // It doesn't ask for the one-call refresh again.
  expect(invoke.mock.calls.slice(3).map((c) => c[1].entity).sort()).toEqual(["Trip", "Vehicle"]);
});

it("the server answers each list exactly as its own call would, sharing the sign-in checks", async () => {
  const sdk = mock("staff");
  sdk.tables.Trip = [
    { id: "t1", company_id: "a", vehicle_id: "bus-a", status: "scheduled" },
    { id: "t2", company_id: "a", vehicle_id: "bus-a2", status: "scheduled" },
    { id: "t3", company_id: "b", vehicle_id: "bus-b", status: "scheduled" },
  ];
  sdk.tables.Vehicle.push({ id: "bus-a2", company_id: "a", name: "Bus A2" });
  const handler = load("entityAccess", sdk).default;
  const single = {};
  for (const entity of ["Vehicle", "Trip"]) single[entity] = (await (await handler(request({ entity, operation: "list", limit: 5000 }))).json()).result;
  sdk.reads.length = 0;
  const response = await handler(request({ entity: "LiveLists", operation: "list", entities: ["Vehicle", "Trip"], limit: 5000 }));
  expect(response.status).toBe(200);
  const { lists, errors } = (await response.json()).result;
  expect(errors).toEqual({});
  expect(lists).toEqual(single);
  // Only company A's trips, and never the other company's.
  expect(lists.Trip.map((t) => t.id).sort()).toEqual(["t1", "t2"]);
  // One sign-in lookup for both lists, and the trips' buses in one read.
  expect(sdk.reads.filter((r) => r.name === "User")).toHaveLength(1);
  expect(sdk.reads.filter((r) => r.name === "Vehicle" && r.method === "get")).toHaveLength(0);
});

it("the one-call refresh needs a sign-in and only accepts known lists", async () => {
  const signedOut = load("entityAccess", mock(null)).default;
  expect((await signedOut(request({ entity: "LiveLists", operation: "list", entities: ["Vehicle"] }))).status).toBe(401);
  const handler = load("entityAccess", mock("staff")).default;
  for (const entities of [[], ["Nope"], ["CompanyMembership"], "Vehicle", Array(17).fill("Vehicle")]) {
    expect((await handler(request({ entity: "LiveLists", operation: "list", entities }))).status).toBe(400);
  }
  expect((await handler(request({ entity: "LiveLists", operation: "update", entities: ["Vehicle"] }))).status).toBe(400);
});
