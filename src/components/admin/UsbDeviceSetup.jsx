import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, Loader2, Play, Plug, ShieldCheck, Upload, Usb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/admin/kit";
import { canTakeOwnership, connectProblem, readiness } from "@/lib/usbSetup";

// Admin → Kiosk tablets → Set up a device. The phone or tablet is plugged
// into this PC; Chrome or Edge talks to Android's USB debugging directly, so
// there is nothing to install and no PowerShell. Steps: install or update the
// kiosk app from its .apk file, make it the device owner, open it.

const browserCanUse = () => typeof navigator !== "undefined" && !!navigator.usb && !window.transittrackDesktop;
const now = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });

function Item({ ok, title, detail }) {
  const Icon = ok ? CheckCircle2 : CircleAlert;
  return (
    <li className="flex gap-3 py-2">
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${ok ? "text-success" : "text-warning"}`} aria-hidden="true" />
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="block text-body-sm text-muted-foreground">{detail}</span>
      </span>
    </li>
  );
}

export default function UsbDeviceSetup() {
  const [session, setSession] = useState(null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState("");
  const [apk, setApk] = useState(null);
  const [log, setLog] = useState([]);
  const sessionRef = useRef(null);
  useEffect(() => () => { sessionRef.current?.close(); }, []);

  const note = (text, ok = true) => setLog((l) => [{ at: now(), text, ok }, ...l].slice(0, 30));
  const refresh = async (s = session) => {
    const next = await s.read();
    setInfo(next);
    return next;
  };

  const connect = async () => {
    setBusy("connect");
    try {
      const { connectUsbDevice } = await import("@/lib/usbAdb");
      const s = await connectUsbDevice();
      if (!s) { setBusy(""); return; }
      sessionRef.current?.close();
      sessionRef.current = s;
      setSession(s);
      const read = await refresh(s);
      note(`Connected to ${read.name}.`);
    } catch (error) {
      note(connectProblem(error), false);
    } finally {
      setBusy("");
    }
  };
  const disconnect = async () => {
    await sessionRef.current?.close();
    sessionRef.current = null;
    setSession(null);
    setInfo(null);
    note("Disconnected. You can unplug the device.");
  };

  const step = async (name, fn) => {
    setBusy(name);
    try { return await fn(); }
    catch (error) { note(connectProblem(error), false); return null; }
    finally { setBusy(""); }
  };
  const install = () => step("install", async () => {
    note(`Installing ${apk.name}… this takes about a minute.`);
    const result = await session.install(apk);
    note(result.message, result.ok);
    await refresh();
    return result.ok;
  });
  const own = () => step("owner", async () => {
    const result = await session.takeOwnership();
    note(result.message, result.ok);
    await refresh();
    return result.ok;
  });
  const open = () => step("open", async () => {
    const ok = await session.openApp();
    note(ok ? "Opened McSween Kiosk on the device." : "Android couldn't open the app. Open it on the device.", ok);
    return ok;
  });
  // Everything in order, stopping at the first problem.
  const setUp = async () => {
    if (apk && !(await install())) return;
    const current = await step("read", () => refresh());
    if (!current) return;
    if (current.owner !== "com.transittrack.app") {
      if (!canTakeOwnership(current)) { note("Fix the items marked above, then press Set up this device again.", false); return; }
      if (!(await own())) return;
    }
    await open();
    note("Done. On the device: pair it, then tap the top-right corner 5 times to set its exit code and start kiosk mode.");
  };

  if (!browserCanUse()) {
    return (
      <Panel title="Set up a device" icon={Usb} description="Install the kiosk app and make it the owner, over a USB cable.">
        <p className="text-body-sm">
          Open this page in <b>Chrome</b> or <b>Microsoft Edge</b> on your Windows PC to use it
          ({typeof window !== "undefined" ? `${window.location.origin}/admin/kiosks` : "Admin → Kiosk tablets"}).
          {typeof window !== "undefined" && window.transittrackDesktop ? " The desktop app can't reach USB devices." : " This browser can't reach USB devices."}
        </p>
      </Panel>
    );
  }

  const items = info ? readiness(info) : [];
  const owner = info?.owner === "com.transittrack.app";
  return (
    <Panel
      title="Set up a device"
      icon={Usb}
      description="Plug the phone or tablet into this PC with a USB cable. This installs the kiosk app and makes it the owner. No PowerShell needed."
      actions={session
        ? <Button variant="outline" onClick={disconnect} disabled={!!busy}>Disconnect</Button>
        : <Button onClick={connect} disabled={!!busy}>{busy === "connect" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plug className="mr-1 h-4 w-4" />}{busy === "connect" ? "Tap Allow on the device…" : "Connect"}</Button>}
    >
      {!session && (
        <ol className="ml-5 list-decimal space-y-1 text-body-sm text-muted-foreground">
          <li>On the device, turn on <b>USB debugging</b>: Settings → About → tap <b>Build number</b> 7 times, then Settings → Developer options → USB debugging.</li>
          <li>To make the app the owner, remove every account first (Settings → Accounts). Android won't allow it otherwise. Updating the app doesn't need this.</li>
          <li>Close Android Studio and the old Kiosk Setup tool, then plug the device in.</li>
          <li>Click <b>Connect</b>, pick the device, then tap <b>Allow</b> on the device and tick <b>Always allow from this computer</b>.</li>
        </ol>
      )}

      {info && (
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <p className="text-title-sm font-bold">{info.name}</p>
            <p className="text-caption text-muted-foreground">Serial {info.serial}</p>
            <ul className="mt-2 divide-y divide-border">{items.map((i) => <Item key={i.key} {...i} />)}</ul>
          </div>
          <div className="space-y-4">
            <div>
              <label htmlFor="kiosk-apk" className="block font-semibold">App file (.apk)</label>
              <p className="text-caption text-muted-foreground">Usually in your Downloads folder, named like McSween-Kiosk-1.9-build-10-test.apk. Use the file made on your usual PC.</p>
              <input id="kiosk-apk" type="file" accept=".apk,application/vnd.android.package-archive" className="mt-2 block w-full text-body-sm" onChange={(e) => setApk(e.target.files?.[0] || null)} />
            </div>
            <Button className="w-full" size="lg" onClick={setUp} disabled={!!busy || (!apk && !info.version)}>
              {busy && busy !== "connect" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              {owner ? (apk ? "Update the app and open it" : "Open the app") : "Set up this device"}
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={install} disabled={!!busy || !apk}><Upload className="mr-1 h-4 w-4" /> Install or update only</Button>
              <Button variant="outline" size="sm" onClick={own} disabled={!!busy || owner || !canTakeOwnership(info)}><ShieldCheck className="mr-1 h-4 w-4" /> Make it the owner</Button>
              <Button variant="outline" size="sm" onClick={open} disabled={!!busy || !info.version}><Play className="mr-1 h-4 w-4" /> Open the app</Button>
              <Button variant="ghost" size="sm" onClick={() => step("read", () => refresh())} disabled={!!busy}>Check again</Button>
            </div>
          </div>
        </div>
      )}

      {log.length > 0 && (
        <ul className="mt-5 space-y-1 border-t border-border pt-3 text-body-sm" aria-live="polite">
          {log.map((l, i) => <li key={i} className={l.ok ? "" : "text-danger"}><span className="text-muted-foreground tabular-nums">{l.at}</span> {l.text}</li>)}
        </ul>
      )}
    </Panel>
  );
}
