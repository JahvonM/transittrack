import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MobileSelect } from "@/components/ui/mobile-select";
import { ArrowLeft, Car, CheckCircle2, MapPin } from "lucide-react";

export default function BookTaxi() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    passenger_name: "",
    phone: "",
    pickup_name: "",
    dropoff_name: "",
    company_id: "",
  });
  const [pickup, setPickup] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);
  const [authed, setAuthed] = useState(null);

  useEffect(() => {
    base44.auth.isAuthenticated().then(setAuthed);
  }, []);

  useEffect(() => {
    if (authed !== true) return;
    base44.functions
      .invoke("bookTaxi", { action: "list" })
      .then((res) => setCompanies(res.data?.companies || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [authed]);

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((p) => {
      setPickup({ lat: p.coords.latitude, lng: p.coords.longitude });
      setForm((f) => ({ ...f, pickup_name: f.pickup_name || "My current location" }));
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.passenger_name || !form.phone || !form.pickup_name || !form.dropoff_name || !form.company_id) return;
    setSubmitting(true);
    try {
      const res = await base44.functions.invoke("bookTaxi", {
        action: "book",
        ...form,
        pickup_lat: pickup?.lat,
        pickup_lng: pickup?.lng,
      });
      setDone(res.data);
    } catch (err) {
      setDone({ error: err.message || "Booking failed" });
    } finally {
      setSubmitting(false);
    }
  };

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  return (
    <div className="min-h-screen bg-slate-900 bg-grid text-slate-50">
      <header className="sticky top-0 z-40 h-14 border-b border-slate-700/50 bg-slate-900/70 backdrop-blur-[12px] safe-area-top">
        <div className="max-w-3xl mx-auto px-4 h-full flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 font-heading font-semibold text-lg">
            <span className="w-8 h-8 rounded-xl bg-sky-400 text-slate-900 grid place-items-center">
              <Car className="w-4 h-4" />
            </span>
            Book a taxi
          </Link>
          <Link to="/" className="text-sm text-slate-400 hover:text-slate-200 inline-flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" />Home
          </Link>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-10 pb-24 md:pb-10">
        {authed === null ? (
          <p className="text-sm text-slate-400 text-center">Checking session…</p>
        ) : authed === false ? (
          <div className="text-center space-y-4 p-6 rounded-[1.25rem] border border-slate-700/50 bg-slate-800/60 backdrop-blur-[12px]">
            <Car className="w-10 h-10 text-sky-300 mx-auto" />
            <h1 className="font-heading font-semibold text-xl">Sign in to book a taxi</h1>
            <p className="text-sm text-slate-400">You need an account to request a ride.</p>
            <div className="flex flex-col gap-2">
              <Button asChild className="rounded-full bg-sky-400 text-slate-900 hover:bg-sky-300">
                <Link to="/login?returnTo=/book-taxi">Sign in</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full">
                <Link to="/register?returnTo=/book-taxi">Create account</Link>
              </Button>
            </div>
          </div>
        ) : done ? (
          done.error ? (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-4">
              <p className="text-destructive">{done.error}</p>
              <Button onClick={() => setDone(null)} variant="outline" className="rounded-full">
                Try again
              </Button>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center space-y-5"
            >
              <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto" />
              <div>
                <h1 className="font-display font-bold text-2xl">Taxi booked!</h1>
                <p className="text-slate-400 mt-1">
                  We've sent your request to {done.company}. A driver will be assigned shortly.
                </p>
              </div>
              <div className="text-xs text-slate-500">Booking ref: {done.trip_id}</div>
              <Button asChild className="rounded-full bg-sky-400 text-slate-900 hover:bg-sky-300">
                <Link to="/">Back to home</Link>
              </Button>
            </motion.div>
          )
        ) : (
          <motion.form
            onSubmit={submit}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4 p-6 rounded-[1.25rem] border border-slate-700/50 bg-slate-800/60 backdrop-blur-[12px]"
          >
            <div className="flex items-center gap-2 text-sky-300">
              <Car className="w-5 h-5" />
              <h1 className="font-heading font-semibold text-xl">Request a taxi</h1>
            </div>
            <p className="text-sm text-slate-400 -mt-2">We'll match you with an available taxi operator.</p>

            {loading ? (
              <p className="text-sm text-slate-400">Loading available operators…</p>
            ) : companies.length === 0 ? (
              <p className="text-sm text-amber-400">
                No taxi operators available right now. Please check back later.
              </p>
            ) : (
              <div className="space-y-1.5">
                <Label>Taxi operator</Label>
                <MobileSelect
                  value={form.company_id}
                  onValueChange={(v) => setForm({ ...form, company_id: v })}
                  placeholder="Choose an operator"
                  options={companies.map((c) => ({ value: c.id, label: c.name }))}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Your name</Label>
              <Input value={form.passenger_name} onChange={set("passenger_name")} placeholder="Jane Doe" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={set("phone")} placeholder="+1 473-..." />
            </div>
            <div className="space-y-1.5">
              <Label>Pickup location</Label>
              <Input value={form.pickup_name} onChange={set("pickup_name")} placeholder="Hotel lobby, airport, address…" />
              <button
                type="button"
                onClick={useMyLocation}
                className="text-xs text-sky-400 inline-flex items-center gap-1"
              >
                <MapPin className="w-3.5 h-3.5" />
                Use my current location
              </button>
            </div>
            <div className="space-y-1.5">
              <Label>Drop-off</Label>
              <Input value={form.dropoff_name} onChange={set("dropoff_name")} placeholder="Destination" />
            </div>
            <Button
              type="submit"
              className="w-full rounded-full bg-sky-400 text-slate-900 hover:bg-sky-300"
              disabled={
                submitting ||
                !form.company_id ||
                !form.passenger_name ||
                !form.phone ||
                !form.pickup_name ||
                !form.dropoff_name
              }
            >
              {submitting ? "Requesting…" : "Request taxi"}
            </Button>
          </motion.form>
        )}
      </main>
    </div>
  );
}