import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { homeFor } from "@/lib/roleHome";
import useWorkshopAppearance from "@/hooks/useWorkshopAppearance";
import useHomeScreenApp from "@/hooks/useHomeScreenApp";
import Logo from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/admin/kit";
import { busRecordWarnings } from "@/lib/busLibrary";
import { modelCodeFor, stockSummary, torqueCounts, workshopVehicles } from "@/lib/workshop";
import { isOpen, openFaultsFor, openJobsFor } from "@/lib/workshopJobs";
import { Notice, Tile, WorkshopContext, pluralize, useWorkshop } from "@/components/workshop/kit";
import VehiclePage from "@/components/workshop/VehiclePage";
import DiagramPage from "@/components/workshop/DiagramPage";
import Models, { CarSheet } from "@/components/workshop/Models";
import PartsPage from "@/components/workshop/PartsPage";
import PartPage from "@/components/workshop/PartPage";
import SearchPage, { SearchBox } from "@/components/workshop/SearchPage";
import ReorderPage from "@/components/workshop/ReorderPage";
import JobsPage from "@/components/workshop/JobsPage";
import JobPage from "@/components/workshop/JobPage";
import { ArrowLeft, BookOpen, Bus, Car, ClipboardList, LogOut, Package, Plus, RefreshCw, Search, Wrench } from "lucide-react";

// The Workshop: app.mcsweenstransport.com/workshop, for the shared tablet in
// the workshop (and phones), laid out like a parts catalogue. Every vehicle
// the workshop looks after; tap one for its details and its sections down
// the side (torque values, specs & service, the parts that fit, photos,
// manuals, and the maker's own categories of diagrams); tap a diagram for
// its picture beside its table of parts. Parts has its own page, with a page
// for each part (stock, shelf, numbers, replacements). A trail
// at the top leads back, and all editing is in one sheet with Cancel and Save.
// Administrators and mechanics only (the server checks every read and save);
// on the tablet, sign in once and it stays signed in until Sign out.
// The workshop's own cars are kept apart from the buses (WorkshopVehicle), so
// they never show on the fleet map, kiosks, driver screens or reports.

const LIST = 2000;

// Lists the Workshop works without for a while. When one can't be loaded,
// the screen that shows it says so (with Try again) rather than looking
// empty; a list that loaded before keeps what it had.
const OPTIONAL = {
  parts: () => base44.entities.Part.list(),
  interchanges: () => base44.entities.PartInterchange.list("-created_date", 5000),
  facts: () => base44.entities.GuideFact.list("sort_order", 5000),
  documents: () => base44.entities.GuideDocument.list("-created_date", 500),
  jobs: () => base44.entities.WorkshopJob.list("-created_date", LIST),
  jobParts: () => base44.entities.WorkshopJobPart.list("-created_date", 5000),
  faults: () => base44.entities.Fault.list("-created_date", 500),
};

function useWorkshopData() {
  const [state, setState] = useState("loading");
  const [data, setData] = useState({ buses: [], cars: [], guides: [], specs: [], diagrams: [], groups: [], parts: [], interchanges: [], facts: [], documents: [], jobs: [], jobParts: [], faults: [], missing: {} });

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setState("loading");
    try {
      const missing = {};
      const optional = Object.entries(OPTIONAL).map(([key, list]) => list().catch(() => { missing[key] = true; return null; }));
      const [buses, cars, guides, specs, diagrams, groups, ...extra] = await Promise.all([
        base44.entities.Vehicle.list(),
        base44.entities.WorkshopVehicle.list("name", 200),
        base44.entities.VehicleGuide.list("make", 200),
        base44.entities.TorqueSpec.list("sort_order", LIST),
        base44.entities.PartDiagram.list("sort_order", 500),
        base44.entities.CatalogueGroup.list("sort_order", LIST),
        ...optional,
      ]);
      setData((d) => ({
        buses: buses || [], cars: cars || [], guides: guides || [], specs: specs || [], diagrams: diagrams || [], groups: groups || [],
        ...Object.fromEntries(Object.keys(OPTIONAL).map((key, i) => [key, missing[key] ? d[key] : extra[i] || []])),
        missing,
      }));
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
  const reload = useCallback(() => load({ quiet: true }), [load]);

  return { state, ...data, load, put, drop, reload };
}

function Home() {
  const { vehicles, specs, diagrams, groups, parts, jobs, faults, missing, isAdmin, state } = useWorkshop();
  const openJobs = jobs.filter(isOpen).length;
  const stock = stockSummary(parts);
  const navigate = useNavigate();
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
    const working = openJobsFor(jobs, v).length;
    const faulty = openFaultsFor(faults, v).length;
    return (
      <li key={`${v.kind}-${v.id}`}>
        <Tile
          to={`/workshop/${v.kind}/${v.id}`} icon={v.kind === "bus" ? Bus : Car} title={v.name}
          lines={[[v.model !== v.name ? v.model : "", code].filter(Boolean).join(" · "), v.engine, v.guide ? [pluralize(counts.total, "torque value"), catalogue.length ? pluralize(catalogue.length, "diagram") : "", pictures ? pluralize(pictures, "photo") : ""].filter(Boolean).join(" · ") : ""]}
          badge={(!v.guide || counts.unchecked > 0 || warnings.length > 0 || working > 0 || faulty > 0) && (
            <span className="flex flex-wrap gap-1.5">
              {working > 0 && <StatusChip tone="info">{pluralize(working, "open job")}</StatusChip>}
              {faulty > 0 && <StatusChip tone="warning">{pluralize(faulty, "open fault")}</StatusChip>}
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
      <SearchBox className="mb-6" onSearch={(q) => navigate(q ? `/workshop/search?q=${encodeURIComponent(q)}` : "/workshop/search")} />
      {buses.length > 0 && (
        <section aria-labelledby="ws-buses" className="mb-6">
          <h2 id="ws-buses" className="mb-2 text-body font-semibold text-muted-foreground">Buses</h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{buses.map(tile)}</ul>
        </section>
      )}
      {cars.length > 0 && (
        <section aria-labelledby="ws-cars" className="mb-6">
          <h2 id="ws-cars" className="mb-2 text-body font-semibold text-muted-foreground">Cars</h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{cars.map(tile)}</ul>
        </section>
      )}
      <section aria-labelledby="ws-work" className="mb-6">
        <h2 id="ws-work" className="mb-2 text-body font-semibold text-muted-foreground">Work</h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <li>
            <Tile
              to="/workshop/jobs" icon={Wrench} title="Jobs"
              lines={[missing.jobs ? "Couldn't load the jobs" : openJobs ? `${pluralize(openJobs, "open job")}` : "No open jobs", "Repairs and services, with the parts used"]}
              badge={!missing.jobs && openJobs > 0 && <StatusChip tone="info">{openJobs} open</StatusChip>}
            />
          </li>
        </ul>
      </section>
      <section aria-labelledby="ws-stock" className="mb-6">
        <h2 id="ws-stock" className="mb-2 text-body font-semibold text-muted-foreground">Stock</h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <li>
            <Tile
              to="/workshop/parts" icon={Package} title="Parts"
              lines={[missing.parts ? "Couldn't load the parts" : `${pluralize(stock.total, "part")} on the shelves`, "Stock, shelves, numbers and replacements"]}
              badge={!missing.parts && stock.low > 0 && <StatusChip tone="warning">{stock.low} low or out</StatusChip>}
            />
          </li>
          {!missing.parts && stock.low > 0 && (
            <li><Tile to="/workshop/parts/reorder" icon={ClipboardList} title="Reorder list" lines={[`${pluralize(stock.low, "part")} to order`, "Send on WhatsApp, email or print"]} /></li>
          )}
        </ul>
      </section>
      {state === "ready" && vehicles.length === 0 && <Notice>No vehicles yet. Buses are added in Admin › Vehicles{isAdmin ? "; cars with Add a car" : ""}.</Notice>}
      {isAdmin && (
        <section aria-labelledby="ws-manage">
          <h2 id="ws-manage" className="mb-2 text-body font-semibold text-muted-foreground">Manage</h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
          {/* One row; with very large text the buttons move to a second row
              instead of running off the screen. */}
          <div className="mx-auto flex min-h-[4rem] max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
            <Link to="/workshop" className="flex min-w-0 grow basis-[9rem] items-center gap-2.5 rounded-lg" aria-label="Workshop home">
              <Logo className="h-9 w-9 shrink-0" />
              <span className="min-w-0">
                <h1 className="text-title-sm font-bold leading-tight">Workshop</h1>
                <span className="block text-caption text-muted-foreground">Parts catalogue · torque · photos</span>
              </span>
            </Link>
            <Button asChild variant="ghost" className="ml-auto h-12 rounded-lg px-3 text-body">
              <Link to="/workshop/search"><Search className="h-4 w-4 sm:mr-1.5" aria-hidden="true" /><span className="sr-only sm:not-sr-only">Search</span></Link>
            </Button>
            <Button asChild variant="ghost" className="h-12 rounded-lg px-3 text-body">
              <Link to={back.to}><ArrowLeft className="h-4 w-4 sm:mr-1.5" aria-hidden="true" /><span className="sr-only sm:not-sr-only">{back.label}</span></Link>
            </Button>
            <Button variant="ghost" className="h-12 rounded-lg px-3 text-body" onClick={() => logout()}><LogOut className="h-4 w-4 sm:mr-1.5" aria-hidden="true" /><span className="sr-only sm:not-sr-only">Sign out</span></Button>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-4">
          {data.state === "failed" && (
            <Notice tone="danger" action={<Button variant="outline" className="h-12 rounded-lg bg-card" onClick={() => data.load()}><RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />Try again</Button>}>
              Couldn't load the workshop. Check the connection.
            </Notice>
          )}
          {data.state === "loading" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-[7rem] animate-pulse rounded-xl border border-border bg-card" />)}
            </div>
          ) : data.state === "ready" && (
            <Routes>
              <Route index element={<Home />} />
              <Route path="models" element={<Models />} />
              <Route path="search" element={<SearchPage />} />
              <Route path="parts" element={<PartsPage />} />
              <Route path="parts/reorder" element={<ReorderPage />} />
              <Route path="parts/:partId" element={<PartPage />} />
              <Route path="jobs" element={<JobsPage />} />
              <Route path="jobs/:jobId" element={<JobPage />} />
              <Route path=":kind/:id" element={<VehiclePage />} />
              <Route path=":kind/:id/torque" element={<VehiclePage section="torque" />} />
              <Route path=":kind/:id/specs" element={<VehiclePage section="specs" />} />
              <Route path=":kind/:id/parts" element={<VehiclePage section="parts" />} />
              <Route path=":kind/:id/manuals" element={<VehiclePage section="manuals" />} />
              <Route path=":kind/:id/maps" element={<VehiclePage section="maps" />} />
              <Route path=":kind/:id/jobs" element={<VehiclePage section="jobs" />} />
              <Route path=":kind/:id/troubleshooting" element={<VehiclePage section="troubleshooting" />} />
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
