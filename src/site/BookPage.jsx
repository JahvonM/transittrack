import React, { useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { errorData } from "@/lib/requestError";
import {
  AIRPORT_NAME, SITE_SERVICES, bookingBody, bookingProblems, grenadaInputFor, isAirportService, withService,
} from "@/lib/bookingSite";
import { routeNumber, sitePath, usePageTitle, useSiteBase, useWhatsApp, whatsappTo } from "@/site/siteKit";

const DESCRIPTION = "Request an airport pickup, drop-off, transfer, island tour or staff run in Grenada. We confirm the price and your bus by email.";
const START = { service: "airport_pickup", when: "", flight_number: "", pickup: "", dropoff: "", guests: "2", luggage: "", name: "", phone: "", email: "", notes: "", website: "" };

function Field({ id, label, hint, error, children }) {
  return (
    <div className="mcs-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <p className="mcs-hint" id={`${id}-hint`}>{hint}</p>}
      {error && <p className="mcs-error" id={`${id}-error`}>{error}</p>}
    </div>
  );
}

// "Tue 27 Oct, 3:30 pm" for the form's time (already Grenada time).
function whenText(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value || "");
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  return d.toLocaleString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
}

function Legend({ n, children }) {
  return <legend><span className="mcs-step" aria-hidden="true">{n}</span>{children}</legend>;
}

// The ride so far, filled in as the visitor types. It repeats the form, so
// screen readers skip it.
function RideTicket({ form }) {
  const i = SITE_SERVICES.findIndex((s) => s.id === form.service);
  const service = SITE_SERVICES[i];
  const when = whenText(form.when);
  const guests = Number(form.guests) > 0 ? `${form.guests} passenger${Number(form.guests) === 1 ? "" : "s"}` : "";
  const bags = Number(form.luggage) > 0 ? `${form.luggage} bag${Number(form.luggage) === 1 ? "" : "s"}` : "";
  const value = (text, empty = "Not filled in yet") => <dd className={text ? undefined : "mcs-empty"}>{text || empty}</dd>;
  return (
    <div className="mcs-ticket mcs-dark" aria-hidden="true">
      <div className="mcs-ticket-head">
        <h2>Your ride</h2>
        {service && <span className="mcs-route">{routeNumber(i)}</span>}
      </div>
      <div className="mcs-ticket-tear" />
      <dl>
        <div><dt>Ride</dt>{value(service?.name)}</div>
        <div><dt>When</dt>{value(when && `${when}, Grenada time`)}</div>
        <div className="mcs-ticket-route">
          <span className="mcs-from" />
          <div><dt>From</dt>{value(form.pickup.trim())}</div>
        </div>
        <div className="mcs-ticket-route">
          <span className="mcs-to" />
          <div><dt>To</dt>{value(form.dropoff.trim())}</div>
        </div>
        <div><dt>Who</dt>{value([guests, bags].filter(Boolean).join(", "))}</div>
        {isAirportService(form.service) && form.flight_number.trim() && <div><dt>Flight</dt>{value(form.flight_number.trim().toUpperCase())}</div>}
      </dl>
    </div>
  );
}

export default function BookPage() {
  const base = useSiteBase();
  const whatsapp = useWhatsApp();
  usePageTitle("Request a ride", DESCRIPTION);
  const [params] = useSearchParams();
  const first = SITE_SERVICES.some((s) => s.id === params.get("service")) ? params.get("service") : START.service;
  const [form, setForm] = useState(() => withService({ ...START }, first));
  const [shown, setShown] = useState(false);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState("");
  const [sent, setSent] = useState(null);
  const startedAt = useRef(Date.now());
  const formRef = useRef(null);

  const problems = useMemo(() => bookingProblems(form), [form]);
  const airport = isAirportService(form.service);
  const err = (key) => (shown ? problems[key] : "");
  const describe = (id, hint) => [hint && `${id}-hint`, err(id) && `${id}-error`].filter(Boolean).join(" ") || undefined;
  const input = (key, extra = {}) => ({
    id: key, name: key, value: form[key],
    onChange: (e) => setForm((f) => ({ ...f, [key]: e.target.value })),
    "aria-invalid": err(key) ? "true" : undefined,
    ...extra,
  });

  const send = async (e) => {
    e.preventDefault();
    setShown(true);
    setFailure("");
    if (Object.keys(problems).length) {
      // The first answer that needs a look, once it is marked.
      setTimeout(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    setSending(true);
    try {
      await base44.functions.invoke("bookingRequest", bookingBody(form, startedAt.current));
      setSent({ email: form.email.trim(), name: form.name.trim().split(" ")[0] });
      window.scrollTo({ top: 0, behavior: "instant" });
    } catch (error) {
      setFailure(errorData(error).error || "We couldn't send your request. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <>
        <div className="mcs-pagehead mcs-dark">
          <div className="mcs-wrap"><h1>Request sent</h1></div>
        </div>
        <section className="mcs-book">
        <div className="mcs-wrap">
          <div className="mcs-done mcs-card" role="status">
            <span className="mcs-done-mark" aria-hidden="true"><Check /></span>
            <h2>Thanks, {sent.name}. We have your request.</h2>
            <p>We emailed a copy to <strong>{sent.email}</strong>. We'll email you again to confirm the time and the price. Nothing is booked until then.</p>
            <p>If you don't see our email, check your spam folder{whatsapp ? <>, or <a href={whatsappTo(whatsapp, "Hi McSween Transport, I sent a ride request on the website. ")} target="_blank" rel="noreferrer">message us on WhatsApp</a></> : ""}.</p>
            <div className="mcs-actions">
              <button type="button" className="mcs-btn mcs-btn-quiet" onClick={() => { setForm(withService({ ...START }, form.service)); setShown(false); setSent(null); startedAt.current = Date.now(); }}>Request another ride</button>
              <Link className="mcs-btn mcs-btn-quiet" to={sitePath(base, "/")}>Back to the home page</Link>
            </div>
          </div>
        </div>
        </section>
      </>
    );
  }

  const minWhen = grenadaInputFor(Date.now() + 61 * 60_000);
  return (
    <>
    <div className="mcs-pagehead mcs-dark">
      <div className="mcs-wrap">
        <h1>Request a ride</h1>
        <p className="mcs-lede">Fill this in and we'll email you to confirm. No account needed.</p>
      </div>
    </div>
    <section className="mcs-book">
      <div className="mcs-wrap mcs-book-grid">
        <div className="mcs-card">
          <form ref={formRef} className="mcs-form" onSubmit={send} noValidate>
            <fieldset>
              <Legend n={1}>What kind of ride?</Legend>
              <div className="mcs-choices">
                {SITE_SERVICES.map((s, i) => (
                  <label key={s.id} className="mcs-choice">
                    <input type="radio" name="service" value={s.id} checked={form.service === s.id} onChange={() => setForm((f) => withService(f, s.id))} />
                    <span><b aria-hidden="true">{routeNumber(i)}</b>{s.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <Legend n={2}>When</Legend>
              <div className="mcs-row mcs-row-2">
                <Field id="when" label={airport && form.service === "airport_pickup" ? "Landing time" : "Pickup time"} hint="Grenada time" error={err("when")}>
                  <input type="datetime-local" min={minWhen} step={300} {...input("when", { "aria-describedby": describe("when", true) })} />
                </Field>
                {airport && (
                  <Field id="flight_number" label="Flight number (optional)" error={err("flight_number")}>
                    <input type="text" autoComplete="off" maxLength={12} placeholder="e.g. AA 1234" {...input("flight_number", { "aria-describedby": describe("flight_number") })} />
                  </Field>
                )}
              </div>
            </fieldset>

            <fieldset>
              <Legend n={3}>Where</Legend>
              <div className="mcs-row mcs-row-2">
                <Field id="pickup" label="Pick up from" error={err("pickup")}>
                  <input type="text" maxLength={160} placeholder="Hotel, villa or address" {...input("pickup", { "aria-describedby": describe("pickup") })} />
                </Field>
                <Field id="dropoff" label="Going to" error={err("dropoff")}>
                  <input type="text" maxLength={160} placeholder="Hotel, villa or address" {...input("dropoff", { "aria-describedby": describe("dropoff") })} />
                </Field>
              </div>
              <div className="mcs-row mcs-row-2">
                <Field id="guests" label="Passengers" error={err("guests")}>
                  <input type="number" inputMode="numeric" min={1} max={60} {...input("guests", { "aria-describedby": describe("guests") })} />
                </Field>
                <Field id="luggage" label="Bags (optional)" error={err("luggage")}>
                  <input type="number" inputMode="numeric" min={0} max={100} placeholder="0" {...input("luggage", { "aria-describedby": describe("luggage") })} />
                </Field>
              </div>
            </fieldset>

            <fieldset>
              <Legend n={4}>Your details</Legend>
              <Field id="name" label="Your name" error={err("name")}>
                <input type="text" autoComplete="name" maxLength={80} {...input("name", { "aria-describedby": describe("name") })} />
              </Field>
              <div className="mcs-row mcs-row-2">
                <Field id="phone" label="Phone or WhatsApp" hint="With the country code" error={err("phone")}>
                  <input type="tel" autoComplete="tel" maxLength={24} placeholder="+1 473 555 0123" {...input("phone", { "aria-describedby": describe("phone", true) })} />
                </Field>
                <Field id="email" label="Email" hint="We send the confirmation here" error={err("email")}>
                  <input type="email" autoComplete="email" maxLength={254} {...input("email", { "aria-describedby": describe("email", true) })} />
                </Field>
              </div>
              <Field id="notes" label="Anything else (optional)" hint="A child seat, a stop on the way, what you'd like to see on a tour" error={err("notes")}>
                <textarea maxLength={1000} {...input("notes", { "aria-describedby": describe("notes", true) })} />
              </Field>
              <div className="mcs-trap" aria-hidden="true">
                <label htmlFor="website">Leave this empty</label>
                <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
              </div>
            </fieldset>

            <div className="mcs-submit">
              {failure && <p className="mcs-alert" role="alert">{failure}</p>}
              {shown && Object.keys(problems).length > 0 && !failure && <p className="mcs-error" role="alert">Some answers need a look. They're marked above.</p>}
              <button type="submit" className="mcs-btn mcs-btn-primary" disabled={sending}>{sending ? "Sending…" : "Send request"}</button>
              <p className="mcs-hint">By sending this you agree to our <Link to={sitePath(base, "/terms")}>terms</Link>. We use your details only for this ride (<Link to={sitePath(base, "/privacy")}>privacy</Link>).</p>
            </div>
          </form>
        </div>

        <aside className="mcs-aside" aria-labelledby="next-title">
          <RideTicket form={form} />
          <div className="mcs-next">
            <h2 id="next-title">What happens next</h2>
            <ol>
              <li>We email you a copy of your request.</li>
              <li>We check a bus is free and email you the price. Nothing is booked until then.</li>
              <li>Before the ride, you get a private link to watch your bus on a map.</li>
            </ol>
            {whatsapp && <p className="mcs-hint">Need a ride in the next hour? <a href={whatsappTo(whatsapp, "Hi McSween Transport, I need a ride soon. ")} target="_blank" rel="noreferrer">Message us on WhatsApp</a>.</p>}
          </div>
        </aside>
      </div>
    </section>
    </>
  );
}
