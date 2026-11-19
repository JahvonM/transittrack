import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import useFutureAppearance from "@/hooks/useFutureAppearance";
import useHomeScreenApp from "@/hooks/useHomeScreenApp";
import Logo from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/admin/kit";
import { busRecordWarnings, guideTitle, yearsLabel } from "@/lib/busLibrary";
import { findVehicle, torqueCounts, workshopVehicles } from "@/lib/workshop";
import { Notice, ScreenBar, Tile, WorkshopContext, pluralize, useWorkshop } from "@/components/workshop/kit";
import TorqueScreen from "@/components/workshop/TorqueScreen";
import { BoltMap, BoltMaps } from "@/components/workshop/BoltMaps";
import Models, { CarSheet } from "@/components/workshop/Models";
import { BookOpen, Bus, Car, LogOut, MapPin, Pencil, Plus, RefreshCw, Wrench } from "lucide-react";

// The Workshop: app.mcsweenstransport.com/workshop, for the shared tablet in
// the workshop (and phones). Every vehicle the workshop looks after, as big
// tiles; tap one, then Torque or Bolt maps. One thing on the screen at a time,
// Back to return, and all editing in one sheet with Cancel and Save.
// Administrators and mechanics only (the server checks every read and save);
// on the tablet, sign in once and it stays signed in until Sign out.
// The workshop's own cars are kept apart from the buses (WorkshopVehicle), so
// they never show on the fleet map, kiosks, driver screens or reports.

const LIST = 2000;

function useWorkshopData() {
  const [state, setState] = useState("loading");
  const [data, setData] = useState({ buses: [], cars: [], guides: [], specs: [], diagrams: [], parts: [] });

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setState("loading");
    try {
      const [buses, cars, guides, specs, diagrams, parts] = await Promise.all([
        base44.entities.Vehicle.list(),
        base44.entities.WorkshopVehicle.list("name", 200),
        base44.entities.VehicleGuide.list("make", 200),
        base44.entities.TorqueSpec.list("sort_order", LIST),
        base44.entities.PartDiagram.list("sort_order", 500),
        // Parts only name what a pin points at: the Workshop works without them.
        base44.entities.Part.list().catch(() => []),
      ]);
      setData({ buses: buses || [], cars: cars || [], guides: guides || [], specs: specs || [], diagrams: diagrams || [], parts: parts || [] });
      setState("ready");
    } catch {
      setState((s) => (quiet && s === "ready" ? s : "failed"));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // A save updates the screen with what the server kept; nothing reloads.
  const put = useCallback((key, record) => {
    if (!record?.id) return;
    setData((d) => ({ ...d, [key]: d[key].some((r) => r.id === record.id) ? d[key].map((r) => (r.id === record.id ? record : r)) : [...d[key], record] }));
  }, []);
  const drop = useCallback((key, id) => setData((d) => ({ ...d, [key]: d[key].filter((r) => r.id !== id) })), []);

  return { state, ...data, load, put, drop, reload: () => load({ quiet: true }) };
}

function Home() {
  const { vehicles, specs, diagrams, isAdmin, state } = useWorkshop();
  const [adding, setAdding] = useState(false);
  const buses = vehicles.filter((v) => v.kind === "bus");
  const cars = vehicles.filter((v) => v.kind === "car");

  const tile = (v) => {
    const torque = v.guide ? specs.filter((s) => s.guide_id === v.guide.id) : [];
    const counts = torqueCounts(torque);
    const pictures = v.guide ? diagrams.filter((d) => d.guide_id === v.guide.id).length : 0;
    const warnings = v.kind === "bus" ? busRecordWarnings(v.record) : [];
    return (
      <li key={`${v.kind}-${v.id}`}>
        <Tile
          to={`/workshop/${v.kind}/${v.id}`} icon={v.kind === "bus" ? Bus : Car} title={v.name}
          lines={[v.model !== v.name ? v.model : "", v.engine, v.guide ? [pluralize(counts.total, "torque value"), pictures ? pluralize(pictures, "bolt map") : ""].filter(Boolean).join(" · ") : ""]}
          badge={(!v.guide || counts.unchecked > 0 || warnings.length > 0) && (
            <span className="flex flex-wrap gap-1.5">
              {!v.guide && <StatusChip tone="warning">No model page</StatusChip>}
              {counts.unchecked > 0 && <StatusChip tone="warning">{counts.unchecked} not checked</StatusChip>}
              {warnings.length > 0 && <StatusChip tone="warning">Check record</StatusChip>}
            </span>
          )}
        />
      </li>
    );
  };

  return (
    <>
      {buses.length > 0 && (
        <section aria-labelledby="ws-buses" className="mb-6">
          <h2 id="ws-buses" className="mb-2 text-body font-semibold text-muted-foreground">Buses</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{buses.map(tile)}</ul>
        </section>
      )}
      {cars.length > 0 && (
        <section aria-labelledby="ws-cars" className="mb-6">
          <h2 id="ws-cars" className="mb-2 text-body font-semibold text-muted-foreground">Cars</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{cars.map(tile)}</ul>
        </section>
      )}
      {state === "ready" && vehicles.length === 0 && <Notice>No vehicles yet. Buses are added in Admin › Vehicles{isAdmin ? "; cars with Add a car" : ""}.</Notice>}
      {isAdmin && (
        <section aria-labelledby="ws-manage">
          <h2 id="ws-manage" className="mb-2 text-body font-semibold text-muted-foreground">Manage</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <li><Tile onClick={() => setAdding(true)} icon={Plus} title="Add a car" lines={["Kept out of the fleet views"]} /></li>
            <li><Tile to="/workshop/models" icon={BookOpen} title="Models" lines={["Model pages and researched values"]} /></li>
          </ul>
        </section>
      )}
      {adding && <CarSheet onClose={() => setAdding(false)} />}
    </>
  );
}

function VehicleScreen() {
  const { kind, id } = useParams();
  const { vehicles, specs, diagrams, isAdmin } = useWorkshop();
  const [editing, setEditing] = useState(false);
  const vehicle = findVehicle(vehicles, kind, id);
  if (!vehicle) return <Navigate to="/workshop" replace />;
  const { guide } = vehicle;
  const base = `/workshop/${kind}/${id}`;
  const counts = torqueCounts(guide ? specs.filter((s) => s.guide_id === guide.id) : []);
  const maps = guide ? diagrams.filter((d) => d.guide_id === guide.id) : [];
  const pins = maps.reduce((n, d) => n + (d.pins || []).length, 0);
  const warnings = kind === "bus" ? busRecordWarnings(vehicle.record) : [];
  const plate = vehicle.record.plate_number;

  return (
    <>
      <ScreenBar back="/workshop" backLabel="Home" title={vehicle.name} subtitle={[vehicle.model !== vehicle.name ? vehicle.model : "", vehicle.engine, vehicle.transmission, plate].filter(Boolean).join(" · ")}>
        {kind === "car" && isAdmin && <Button variant="secondary" className="h-12 rounded-xl text-body" onClick={() => setEditing(true)}><Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />Edit car</Button>}
      </ScreenBar>

      {warnings.length > 0 && (
        <Notice tone="warning"><ul className="list-disc space-y-0.5 pl-5">{warnings.map((w) => <li key={w}>{w}</li>)}</ul></Notice>
      )}

      {!guide ? (
        <Notice tone="warning" action={isAdmin ? <Button asChild variant="secondary" className="h-12 rounded-xl"><Link to="/workshop/models">Models</Link></Button> : null}>
          <p className="font-semibold">No model page covers this {kind} yet.</p>
          <p className="text-muted-foreground">
            Torque values and bolt maps belong to a model page for its make, model and year ({vehicle.model || "not recorded"}).
            {isAdmin ? " Add one in Models." : " Ask an administrator to add one."}
          </p>
        </Notice>
      ) : (
        <>
          <p className="mb-3 text-body-sm text-muted-foreground">From the {guideTitle(guide)}{guide.generation ? ` ${guide.generation}` : ""} page ({yearsLabel(guide)}): shared by every vehicle of this model.</p>
          <ul className="grid gap-3 sm:grid-cols-2">
            <li>
              <Tile to={`${base}/torque`} icon={Wrench} title="Torque" lines={[`${pluralize(counts.total, "value")}${counts.unchecked ? ` · ${counts.unchecked} not checked` : ""}`]} className="min-h-[9rem]" />
            </li>
            <li>
              <Tile to={`${base}/maps`} icon={MapPin} title="Bolt maps" lines={[`${pluralize(maps.length, "picture")} · ${pluralize(pins, "pin")}`]} className="min-h-[9rem]" />
            </li>
          </ul>
        </>
      )}
      {editing && <CarSheet editing={vehicle.record} onClose={() => setEditing(false)} />}
    </>
  );
}

export default function Workshop() {
  useFutureAppearance();
  useHomeScreenApp({ manifest: "/workshop.webmanifest?v=workshop1", title: "Workshop" });
  const { user, logout } = useAuth();
  const data = useWorkshopData();
  const isAdmin = user?.role === "admin";
  const vehicles = useMemo(() => workshopVehicles(data.buses, data.cars, data.guides), [data.buses, data.cars, data.guides]);
  const value = useMemo(() => ({ ...data, vehicles, isAdmin, user }), [data, vehicles, isAdmin, user]);

  return (
    <WorkshopContext.Provider value={value}>
      <div className="tt-phone-future min-h-[100dvh] touch-manipulation bg-background text-foreground">
        <header className="safe-area-top border-b border-border">
          <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4">
            <Link to="/workshop" className="flex items-center gap-2.5 rounded-xl" aria-label="Workshop home">
              <Logo className="h-9 w-9" />
              <h1 className="text-title font-semibold">Workshop</h1>
            </Link>
            <Button variant="ghost" className="ml-auto h-12 rounded-xl text-body" onClick={() => logout()}><LogOut className="mr-1.5 h-4 w-4" aria-hidden="true" />Sign out</Button>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-4">
          {data.state === "failed" && (
            <Notice tone="danger" action={<Button variant="secondary" className="h-12 rounded-xl" onClick={() => data.load()}><RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />Try again</Button>}>
              Couldn't load the workshop. Check the connection.
            </Notice>
          )}
          {data.state === "loading" ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-[7.5rem] animate-pulse rounded-2xl bg-card" />)}
            </div>
          ) : data.state === "ready" && (
            <Routes>
              <Route index element={<Home />} />
              <Route path="models" element={<Models />} />
              <Route path=":kind/:id" element={<VehicleScreen />} />
              <Route path=":kind/:id/torque" element={<TorqueScreen />} />
              <Route path=":kind/:id/maps" element={<BoltMaps />} />
              <Route path=":kind/:id/maps/:diagramId" element={<BoltMap />} />
              <Route path="*" element={<Navigate to="/workshop" replace />} />
            </Routes>
          )}
        </main>
      </div>
    </WorkshopContext.Provider>
  );
}
