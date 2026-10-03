import { it } from "vitest";
import route from "./fixtures/route-short.json";
import { parseDirections, projectOnRoute } from "@/lib/navigation";

it("debug", () => {
  const nav = parseDirections(route);
  const at = (along) => {
    const i = nav.cum.findIndex((c) => c >= along);
    const a = nav.geometry[Math.max(0, i - 1)];
    const b = nav.geometry[i];
    const f = (along - nav.cum[i - 1]) / (nav.cum[i] - nav.cum[i - 1]);
    return { lng: a[0] + (b[0] - a[0]) * f, lat: a[1] + (b[1] - a[1]) * f, i };
  };
  const pos = at(3000);
  const before = projectOnRoute(nav, at(2950));
  const p = projectOnRoute(nav, { lat: pos.lat + 0.0002, lng: pos.lng }, before.seg);
  const exact = projectOnRoute(nav, pos, before.seg);
  console.log(JSON.stringify({ pos, before: { seg: before.seg, along: before.along }, p: { seg: p.seg, along: p.along, off: p.offM }, exact: { seg: exact.seg, along: exact.along, off: exact.offM }, segs: nav.geometry.length }));
  console.log(JSON.stringify(nav.geometry.slice(pos.i - 3, pos.i + 3)), nav.cum.slice(pos.i - 3, pos.i + 3).map(Math.round));
});
