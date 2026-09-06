import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import LiveClock from "@/components/LiveClock";
import WeatherWidget from "@/components/WeatherWidget";
import Logo from "@/components/Logo";
import { Button } from "@/components/ui/button";
import {
  Bus,
  Car,
  ChevronRight,
  Clock,
  Hotel,
  LayoutDashboard,
  LogIn,
  LogOut,
  MapPin,
  ShieldCheck,
} from "lucide-react";

const ROLES = {
  passenger: {
    to: "/passenger",
    title: "Passenger",
    icon: MapPin,
    blurb: "Live buses, arrival times and the route explorer.",
  },
  driver: {
    to: "/driver",
    title: "Driver",
    icon: Car,
    blurb: "Your shift, trips and one-tap GPS sharing.",
  },
  company: {
    to: "/company",
    title: "Company",
    icon: LayoutDashboard,
    blurb: "Manage vehicles, routes and trips.",
  },
  staff: {
    to: "/staff",
    title: "Hotel staff",
    icon: Hotel,
    blurb: "Pickup alerts and buses approaching your stop.",
  },
  admin: {
    to: "/admin",
    title: "Admin",
    icon: ShieldCheck,
    blurb: "Fleet health, users, roles and scheduling.",
  },
};

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } } };
const rise = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

const greetingWord = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
};

export default function Welcome() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [preview, setPreview] = useState({});
  const role = user?.role || "passenger";

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    if (role === "admin") {
      base44.entities.Vehicle.list().then((vs) => {
        const live = vs.filter((v) => v.status !== "offline").length;
        setPreview((p) => (p.admin ? p : { ...p, admin: `${vs.length} vehicles · ${live} live now` }));
      });
    } else if (role === "driver") {
      base44.entities.Trip.filter({ driver_email: user.email }).then((ts) => {
        const active = ts.filter((t) => t.status === "on_the_way" || t.status === "arrived").length;
        setPreview((p) => (p.driver ? p : { ...p, driver: `${ts.length} trips · ${active} running` }));
      });
    }
    return undefined;
  }, [isAuthenticated, role]);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const dest = ROLES[role]?.to || "/passenger";
    navigate(dest, { replace: true });
  }, [isAuthenticated, user, role, navigate]);

  const redirecting = isAuthenticated && !!user;
  const displayName = (user?.full_name || user?.email || "").trim();
  const firstName = displayName.split(" ")[0].split("@")[0] || "there";
  const initials = (displayName.split(/\s+/).map((p) => p[0]).join("").slice(0, 2) || "·").toUpperCase();
  const dateStr = new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });

  const cardKeys = !isAuthenticated || role === "admin" ? Object.keys(ROLES) : [role];

  const open = (to) => navigate(isAuthenticated ? to : `/login?returnTo=${to}`);

  if (redirecting) {
    return (
      <div className="min-h-screen bg-slate-900 grid place-items-center">
        <div className="w-8 h-8 border-4 border-slate-700 border-t-sky-400 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 bg-grid text-slate-50">
      <header className="sticky top-0 z-40 h-14 border-b border-slate-700/50 bg-slate-900/70 backdrop-blur-[12px]">
        <div className="max-w-6xl mx-auto px-4 h-full flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2.5 font-heading font-semibold text-lg">
            <Logo className="w-8 h-8" />
            MCSween's Transport
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <WeatherWidget variant="chip" />
            <LiveClock className="hidden sm:block text-xs text-slate-400" />
            {isAuthenticated ? (
              <>
                <span className="hidden sm:grid w-9 h-9 rounded-full bg-sky-400/15 text-sky-300 place-items-center text-xs font-semibold shrink-0">
                  {initials}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => logout()}
                  className="text-slate-300 hover:text-slate-50"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline ml-1.5">Sign out</span>
                </Button>
              </>
            ) : (
              <Button asChild size="sm" className="rounded-full bg-sky-400 text-slate-900 hover:bg-sky-300">
                <Link to="/login">
                  <LogIn className="w-4 h-4 mr-1.5" />
                  Sign in
                </Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <section className="relative min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center text-center px-4 py-16">
        <motion.div variants={stagger} initial="hidden" animate="show" className="max-w-3xl space-y-6">
          <motion.p variants={rise} className="text-xs sm:text-sm uppercase tracking-[0.25em] text-sky-400">
            {dateStr}
          </motion.p>
          <motion.h1
            variants={rise}
            className="font-display font-bold leading-[1.05]"
            style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)" }}
          >
            {isAuthenticated ? `Hello, ${firstName}` : "Welcome to Transit Hub"}
          </motion.h1>
          <motion.p variants={rise} className="text-slate-400">
            {isAuthenticated
              ? `${greetingWord()} — pick up right where you left off.`
              : "Live tracking for buses and taxis. Choose a role below or sign in to get moving."}
          </motion.p>
          <motion.div variants={rise} className="flex flex-wrap items-center justify-center gap-3">
            <WeatherWidget variant="hero" />
            <span className="flex items-center gap-2 px-4 py-2 rounded-full border border-slate-700/50 bg-slate-800/60 backdrop-blur-[12px]">
              <Clock className="w-4 h-4 text-sky-400" />
              <LiveClock className="text-base" />
            </span>
          </motion.div>
          {!isAuthenticated && (
            <motion.div variants={rise} className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Button
                asChild
                size="lg"
                className="w-full sm:w-auto rounded-full px-8 bg-sky-400 text-slate-900 hover:bg-sky-300"
              >
                <Link to="/login">Sign in</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="w-full sm:w-auto rounded-full px-8 border-slate-700/50 bg-slate-800/60 hover:bg-slate-800 text-slate-50"
              >
                <Link to="/register">Create account</Link>
              </Button>
            </motion.div>
          )}

          <motion.div variants={rise} className="pt-2">
            <Button
              asChild
              variant="outline"
              size="lg"
              className="rounded-full px-8 border-sky-400/40 bg-sky-400/10 text-sky-300 hover:bg-sky-400/20"
            >
              <Link to="/book-taxi">
                <Car className="w-4 h-4 mr-1.5" />
                Book a taxi
              </Link>
            </Button>
          </motion.div>
        </motion.div>
      </section>

      <section className="max-w-6xl mx-auto px-4 pb-24">
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {cardKeys.map((key) => {
            const r = ROLES[key];
            const Icon = r.icon;
            return (
              <motion.button
                key={key}
                variants={rise}
                whileHover={{ y: -4 }}
                onClick={() => open(r.to)}
                className="group text-left p-6 rounded-[1.25rem] border border-slate-700/50 bg-slate-800/60 backdrop-blur-[12px] transition-shadow hover:border-sky-400/60 hover:shadow-[0_0_30px_-6px_rgba(56,189,248,0.4)]"
              >
                <div className="w-11 h-11 rounded-full bg-sky-400/15 text-sky-400 grid place-items-center mb-4">
                  <Icon className="w-5 h-5" />
                </div>
                <h2 className="font-heading font-semibold text-xl mb-1">{r.title}</h2>
                <p className="text-sm text-slate-400">{r.blurb}</p>
                <div className="mt-5 flex items-center justify-between">
                  <span className="text-xs text-emerald-400 inline-flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    {preview[key] || (isAuthenticated ? "Open" : "Sign in to continue")}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-sky-400" />
                </div>
              </motion.button>
            );
          })}
        </motion.div>
      </section>
    </div>
  );
}