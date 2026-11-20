import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { homeFor } from "@/lib/roleHome";
import useWorkshopAppearance from "@/hooks/useWorkshopAppearance";
import useHomeScreenApp from "@/hooks/useHomeScreenApp";
import Logo from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/admin/kit";
import { busRecordWarnings } from "@/lib/busLibrary";
import { modelCodeFor, torqueCounts, workshopVehicles } from "@/lib/workshop";
import { Notice, Tile, WorkshopContext, pluralize, useWorkshop } from "@/components/workshop/kit";
import VehiclePage from "@/components/workshop/VehiclePage";
import DiagramPage from "@/components/workshop/DiagramPage";
import Models, { CarSheet } from "@/components/workshop/Models";
import { ArrowLeft, BookOpen, Bus, Car, LogOut, Plus, RefreshCw } from "lucide-react";

// The Workshop: app.mcsweenstransport.com/workshop, for the shared tablet in
// the workshop (and phones), laid out like a parts catalogue. Every vehicle
// the workshop looks after; tap one for its details and its sections down
// the side (torque values, photos, and the maker's own categories of
// diagrams); tap a diagram for its picture beside its table of parts. A trail
// at the top leads back, and all editing is in one sheet with Cancel and Save.
// Administrators and mechanics only (the server checks every read and save);
// on the tablet, sign in once and it stays signed in until Sign out.
// The workshop's own cars are kept apart from the buses (WorkshopVehicle), so
// they never show on the fleet map, kiosks, driver screens or reports.

const LIST = 2000;

function useWorkshopData() {
  const [state, setState] = useState("loading");
  const [data, setData] = useState({ buses: [], cars: [], guides: [], specs: [], diagrams: [], groups: [], parts: [] });

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setState("loading");
    try {
      const [buses, cars, guides, specs, diagrams, groups, parts] = await Promise.all([
        base44.entities.Vehicle.list(),
        base44.entities.WorkshopVehicle.list("name", 200),
        base44.entities.VehicleGuide.list("make", 200),
        base44.entities.TorqueSpec.list("sort_order", LIST),
        base44.entities.PartDiagram.list("sort_order", 500),
        base44.entities.CatalogueGroup.list("sort_order", LIST),
        // Parts only name what a pin points at: the Workshop works without them.
        base44.entities.Part.list().catch(() => []),
      ]);
      setData({ buses: buses || [], cars: cars || [], guides: guides || [], specs: specs || [], diagrams: diagrams || [], groups: groups || [], parts: parts || [] });
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
  const { vehicles, specs, diagrams, groups, isAdmin, state } = useWorkshop();
  const [adding, setAdding] = useState(false);
  const buses = vehicles.filter((v) => v.kind === "bus");
  const cars = vehicles.filter((v) => v.kind === "car");

  const tile = (v) => {
    const torque = v.guide ? specs.filter((s) => s.guide_id === v.guide.id) : [];
    const counts = torqueCounts(torque);
    const pictures = v.guide ? diagrams.filter((d) => d.guide_id === v.guide.id).length : 0;
    const catalogue = v.guide ? groups.filter((g) => g.guide_id === v.guide.id) : [];
    const code = modelCodeFor(v, catalogue);
    const warnings = v.kind === "bus" ? busRecordWarnings(v.record) : [];
    return (
      <li key={`${v.kind}-${v.id}`}>
        <Tile
          to={`/workshop/${v.kind}/${v.id}`} icon={v.kind === "bus" ? Bus : Car} title={v.name}
          lines={[[v.model !== v.name ? v.model : "", code].filter(Boolean).join(" · "), v.engine, v.guide ? [pluralize(counts.total, "torque value"), catalogue.length ? pluralize(catalogue.length, "diagram") : "", pictures ? pluralize(pictures, "photo") : ""].filter(Boolean).join(" · ") : ""]}
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

export default function Workshop() {
  useWorkshopAppearance();
  useHomeScreenApp({ manifest: "/workshop.webmanifest?v=workshop1", title: "Workshop" });
  const { user, logout } = useAuth();
  const data = useWorkshopData();
  const isAdmin = user?.role === "admin";
  // Back to Admin or the mechanic screen, inside the same home-screen app
  // (the Workshop's manifest scope is the whole site).
  const back = { to: homeFor(user), label: isAdmin ? "Admin" : user?.role === "mechanic" ? "Mechanic" : "Home" };
  const vehicles = useMemo(() => workshopVehicles(data.buses, data.cars, data.guides), [data.buses, data.cars, data.guides]);
  const value = useMemo(() => ({ ...data, vehicles, isAdmin, user }), [data, vehicles, isAdmin, user]);

  return (
    <WorkshopContext.Provider value={value}>
      <div className="min-h-[100dvh] touch-manipulation bg-background text-foreground">
        <header className="safe-area-top border-b border-border bg-card shadow-sm">
          <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
            <Link to="/workshop" className="flex items-center gap-2.5 rounded-lg" aria-label="Workshop home">
              <Logo className="h-9 w-9" />
              <span>
                <h1 className="text-title-sm font-bold leading-tight">Workshop</h1>
                <span className="block text-caption text-muted-foreground">Parts catalogue · torque · photos</span>
              </span>
            </Link>
            <Button asChild variant="ghost" className="ml-auto h-12 rounded-lg px-3 text-body">
              <Link to={back.to}><ArrowLeft className="h-4 w-4 sm:mr-1.5" aria-hidden="true" /><span className="sr-only sm:not-sr-only">{back.label}</span></Link>
            </Button>
            <Button variant="ghost" className="h-12 rounded-lg text-body" onClick={() => logout()}><LogOut className="mr-1.5 h-4 w-4" aria-hidden="true" />Sign out</Button>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-4">
          {data.state === "failed" && (
            <Notice tone="danger" action={<Button variant="outline" className="h-12 rounded-lg bg-card" onClick={() => data.load()}><RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />Try again</Button>}>
              Couldn't load the workshop. Check the connection.
            </Notice>
          )}
          {data.state === "loading" ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-[7rem] animate-pulse rounded-xl border border-border bg-card" />)}
            </div>
          ) : data.state === "ready" && (
            <Routes>
              <Route index element={<Home />} />
              <Route path="models" element={<Models />} />
              <Route path=":kind/:id" element={<VehiclePage />} />
              <Route path=":kind/:id/torque" element={<VehiclePage section="torque" />} />
              <Route path=":kind/:id/maps" element={<VehiclePage section="maps" />} />
              <Route path=":kind/:id/c/:category" element={<VehiclePage section="category" />} />
              <Route path=":kind/:id/maps/:diagramId" element={<DiagramPage mode="picture" />} />
              <Route path=":kind/:id/group/:groupId" element={<DiagramPage mode="group" />} />
              <Route path="*" element={<Navigate to="/workshop" replace />} />
            </Routes>
          )}
        </main>
      </div>
    </WorkshopContext.Provider>
  );
}
