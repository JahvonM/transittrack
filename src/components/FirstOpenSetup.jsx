import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Camera, Check, Copy, Ellipsis, EllipsisVertical, MapPin, Share, SquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LOGO_URL } from "@/components/Logo";
import {
  appWasInstalled, canPromptInstall, installContext, installStep, markFirstOpenDone, onInstallChange, promptInstall,
} from "@/lib/appInstall";
import { APP_PERMISSIONS, permissionStatus, requestAllPermissions, requestPermission } from "@/lib/appPermissions";

// The first time someone opens McSween Transport in a browser:
//  1. Get the app: the browser's Install button where there is one (Android,
//     Chrome/Edge on a computer), a step-by-step walkthrough on iPhone and
//     iPad (Safari's Share menu), and "open it in your browser" for links
//     opened inside Facebook, Instagram and the like.
//  2. Allow everything the app uses in one go: notifications, location,
//     camera and microphone.
// Closing it at any step ("Not now") is remembered on this device.

const ICONS = { notifications: Bell, location: MapPin, media: Camera };

function HomeScreenIcon() {
  return (
    <figure className="flex flex-col items-center gap-2" aria-hidden="true">
      <img src={LOGO_URL} alt="" className="h-[72px] w-[72px] rounded-[22%] shadow-lg ring-1 ring-black/10" />
      <figcaption className="text-xs font-medium text-muted-foreground">McSween</figcaption>
    </figure>
  );
}

// The control to tap, drawn the way it looks in the browser.
function Control({ icon: Icon, children }) {
  return (
    <span className="mx-0.5 inline-flex items-center gap-1 rounded-md border border-border bg-muted px-1.5 py-0.5 align-middle text-[0.8125rem] font-semibold text-foreground">
      {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}{children}
    </span>
  );
}

function Steps({ items }) {
  return (
    <ol className="space-y-4">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-bold text-primary" aria-hidden="true">{i + 1}</span>
          <div className="min-w-0 pt-0.5">
            <p className="font-semibold leading-snug">{item.title}</p>
            {item.detail && <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{item.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

const ADD_STEPS = (ipad) => [
  { title: <>Tap the Share button <Control icon={Share}>Share</Control></>,
    detail: ipad ? "It's at the top right of Safari, next to the address bar." : "It's in the bar at the bottom of Safari. If you only see •••, tap that first." },
  { title: <>Tap <Control icon={SquarePlus}>Add to Home Screen</Control></>, detail: "Scroll down the list if you don't see it." },
  { title: <>Tap <Control>Add</Control></>, detail: "If you see Open as Web App, leave it switched on." },
  { title: "Open McSween Transport from your Home Screen", detail: "It's the icon shown above." },
];

const OTHER_IOS_STEPS = [
  { title: <>Tap the Share button <Control icon={Share}>Share</Control></>, detail: "In Chrome and Edge it's in the address bar. In Firefox, tap the menu first." },
  { title: <>Tap <Control icon={SquarePlus}>Add to Home Screen</Control></>, detail: "Scroll down the list if you don't see it." },
  { title: <>Tap <Control>Add</Control></>, detail: "Then open McSween Transport from your Home Screen." },
];

const ANDROID_STEPS = [
  { title: <>Open the browser menu <Control icon={EllipsisVertical}>Menu</Control></>, detail: "At the top right in Chrome. In Samsung Internet, tap the menu at the bottom." },
  { title: <>Tap <Control>Install app</Control> or <Control>Add to Home screen</Control></>, detail: "The wording depends on your browser." },
  { title: <>Tap <Control>Install</Control></>, detail: "Then open McSween Transport from your Home Screen or app list." },
];

const INAPP_STEPS = (ios) => [
  { title: <>Tap the menu <Control icon={ios ? Ellipsis : EllipsisVertical}>Menu</Control> in the corner</>, detail: "Facebook, Instagram and similar apps show links in their own viewer." },
  { title: <>Choose <Control>{ios ? "Open in Safari" : "Open in browser"}</Control></>, detail: "Or copy the link below and paste it into your browser." },
  { title: "Add the app from there", detail: "This page will show you how." },
];

function statusText(id, state, ctx) {
  if (state === "granted") return { label: "Allowed", tone: "text-success" };
  if (state === "denied") return { label: "Blocked", tone: "text-warning", help: ctx.ios ? "Turn it on in your iPhone or iPad Settings." : "Turn it on in your browser's site settings." };
  if (state === "asking") return { label: "Asking…", tone: "text-muted-foreground" };
  if (state === "unsupported") {
    if (id === "notifications" && ctx.ios && !ctx.standalone) return { label: "After you add the app", tone: "text-muted-foreground", help: "iPhone and iPad only send alerts to apps on the Home Screen." };
    return { label: "Not on this device", tone: "text-muted-foreground" };
  }
  return null;
}

function PermissionRow({ item, state, ctx, onAllow, busy }) {
  const Icon = ICONS[item.id];
  const status = statusText(item.id, state, ctx);
  return (
    <li className="flex items-start gap-3 py-3.5 first:pt-0 last:pb-0">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary" aria-hidden="true"><Icon className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug">{item.title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{item.why}</p>
        {status?.help && <p className="mt-1 text-sm text-muted-foreground">{status.help}</p>}
      </div>
      <div className="shrink-0 pt-0.5">
        {status ? (
          <span role="status" className={`inline-flex items-center gap-1 text-sm font-semibold ${status.tone}`}>
            {state === "granted" && <Check className="h-4 w-4" aria-hidden="true" />}{status.label}
          </span>
        ) : (
          <Button variant="outline" size="sm" onClick={onAllow} disabled={busy} aria-label={`Allow ${item.title.toLowerCase()}`}>Allow</Button>
        )}
      </div>
    </li>
  );
}

export default function FirstOpenSetup({ onClose }) {
  const [ctx] = useState(() => installContext());
  const [promptable, setPromptable] = useState(canPromptInstall);
  const [step, setStep] = useState(null);
  const [states, setStates] = useState({});
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const heading = useRef(null);

  // Chrome may say it can install a moment after the page loads.
  useEffect(() => onInstallChange(() => {
    setPromptable(canPromptInstall());
    if (appWasInstalled()) setStep((s) => (s === "prompt" || s === "android-menu" ? "permissions" : s));
  }), []);

  // Start once the page has had a moment to load (and Chrome to offer
  // its install prompt), so the screen doesn't change under the person.
  useEffect(() => {
    const wait = ctx.android || !ctx.mobile ? 1200 : 500;
    const timer = setTimeout(() => setStep((s) => s || installStep(ctx, canPromptInstall()) || "permissions"), wait);
    return () => clearTimeout(timer);
  }, [ctx]);
  // A computer whose browser offers to install after all.
  useEffect(() => {
    if (step === "permissions" && promptable && !ctx.mobile && !ctx.standalone && !states.started) setStep("prompt");
  }, [promptable]);

  const installing = step && step !== "permissions" && step !== "ios-open";
  const hasInstallStep = useRef(false);
  if (installing) hasInstallStep.current = true;

  useEffect(() => {
    if (step !== "permissions") return;
    let live = true;
    Promise.all(APP_PERMISSIONS.map(async ({ id }) => [id, await permissionStatus(id)])).then((pairs) => {
      if (live) setStates((s) => ({ ...Object.fromEntries(pairs), ...s }));
    });
    return () => { live = false; };
  }, [step]);

  useEffect(() => { if (step) heading.current?.focus(); }, [step]);
  useEffect(() => {
    if (!step) return undefined;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; };
  }, [!!step]);

  const close = useCallback(() => { markFirstOpenDone(); onClose?.(); }, [onClose]);
  useEffect(() => {
    if (!step) return undefined;
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, !!step]);

  const install = async () => {
    setBusy(true);
    const outcome = await promptInstall();
    setBusy(false);
    if (outcome === "accepted") setStep("permissions");
    else if (outcome === "unavailable") setStep(ctx.android ? "android-menu" : "permissions");
  };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); } catch { setCopied(false); }
  };
  const setOne = (id, state) => setStates((s) => ({ ...s, [id]: state, started: true }));
  const allowAll = async () => {
    setBusy(true);
    try { await requestAllPermissions(states, setOne); } finally { setBusy(false); }
  };
  const allowOne = async (id) => {
    setBusy(true);
    setOne(id, "asking");
    try { setOne(id, await requestPermission(id)); } finally { setBusy(false); }
  };

  if (!step) return null;

  const left = APP_PERMISSIONS.filter(({ id }) => !states[id] || states[id] === "prompt").length;
  const counting = hasInstallStep.current && step !== "ios-open";
  const stepNumber = step === "permissions" ? 2 : 1;

  // "Not now" on the get-the-app screens still goes on to the permissions.
  let title, body, content, primary, secondary = { label: "Not now", onClick: () => setStep("permissions") };
  if (step === "prompt") {
    title = ctx.mobile ? "Install the McSween Transport app" : "Install McSween Transport on this computer";
    body = ctx.mobile ? "It opens in one tap from your Home Screen, full screen, and can alert you about your rides." : "It opens in its own window from your desktop or taskbar, and can alert you about your rides.";
    primary = { label: "Install the app", onClick: install };
  } else if (step === "ios-safari") {
    title = `Add McSween Transport to your ${ctx.ipad ? "iPad" : "iPhone"}`;
    body = "It goes on your Home Screen like any other app, opens full screen, and can alert you about your rides.";
    content = <Steps items={ADD_STEPS(ctx.ipad)} />;
    primary = { label: "I've added it", onClick: () => setStep("ios-open") };
  } else if (step === "ios-other") {
    title = `Add McSween Transport to your ${ctx.ipad ? "iPad" : "iPhone"}`;
    body = "It goes on your Home Screen like any other app and opens full screen.";
    content = <><Steps items={OTHER_IOS_STEPS} /><p className="mt-4 text-sm text-muted-foreground">Don't see Add to Home Screen? Open this page in Safari and try again.</p></>;
    primary = { label: "I've added it", onClick: () => setStep("ios-open") };
  } else if (step === "android-menu") {
    title = "Add McSween Transport to your phone";
    body = "It goes on your Home Screen like any other app and opens full screen.";
    content = <Steps items={ANDROID_STEPS} />;
    primary = { label: "Done", onClick: () => setStep("permissions") };
  } else if (step === "inapp") {
    title = "Open this page in your browser";
    body = "The app can't be added from inside another app's link viewer.";
    content = (
      <>
        <Steps items={INAPP_STEPS(ctx.ios)} />
        <Button variant="outline" className="mt-5 w-full" onClick={copyLink}>
          {copied ? <><Check className="h-4 w-4" aria-hidden="true" /> Link copied</> : <><Copy className="h-4 w-4" aria-hidden="true" /> Copy link</>}
        </Button>
      </>
    );
    primary = { label: "Continue here", onClick: () => setStep("permissions") };
  } else if (step === "ios-open") {
    title = "Now open it from your Home Screen";
    body = "Leave Safari and tap the McSween icon. The app will ask for notifications and location there, so it can alert you about your rides.";
    primary = { label: "Done", onClick: close };
    secondary = null;
  } else {
    title = "Allow what the app needs";
    body = "So McSween Transport can alert you and show you on the map. You can change these later in your settings.";
    content = (
      <ul className="divide-y divide-border rounded-2xl border border-border bg-card p-4">
        {APP_PERMISSIONS.map((item) => (
          <PermissionRow key={item.id} item={item} state={states[item.id]} ctx={ctx} busy={busy} onAllow={() => allowOne(item.id)} />
        ))}
      </ul>
    );
    primary = left ? { label: "Allow all", onClick: allowAll } : { label: "Done", onClick: close };
    secondary = left ? { label: "Not now", onClick: close } : null;
  }
  const showIcon = step !== "permissions";

  return (
    <div className="fixed inset-0 z-[80] flex bg-background sm:items-center sm:justify-center sm:bg-black/60 sm:p-6 sm:backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="first-open-title"
        className="flex h-full w-full flex-col bg-background sm:h-auto sm:max-h-[min(760px,92dvh)] sm:max-w-md sm:rounded-3xl sm:border sm:border-border sm:shadow-2xl">
        <header className="flex items-center gap-2.5 px-5 pb-2 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6 sm:pt-6">
          <img src={LOGO_URL} alt="" className="h-7 w-7 rounded-[28%]" />
          <span className="flex-1 text-sm font-semibold">McSween Transport</span>
          {counting && <span className="text-sm text-muted-foreground">Step {stepNumber} of 2</span>}
        </header>
        <div className="flex-1 overflow-y-auto px-5 pb-4 pt-4 sm:px-6">
          {showIcon && <div className="mb-6 mt-2 flex justify-center"><HomeScreenIcon /></div>}
          <h2 id="first-open-title" ref={heading} tabIndex={-1} className="font-heading text-2xl font-bold leading-tight tracking-tight outline-none sm:text-[1.65rem]">{title}</h2>
          <p className="mt-2 text-base leading-relaxed text-muted-foreground">{body}</p>
          {content && <div className="mt-6">{content}</div>}
        </div>
        <footer className="space-y-2 border-t border-border px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
          <Button size="lg" className="w-full" onClick={primary.onClick} loading={busy && (step === "prompt" || step === "permissions")}>{primary.label}</Button>
          {secondary && <Button variant="ghost" size="lg" className="w-full" onClick={secondary.onClick} disabled={busy && step === "permissions"}>{secondary.label}</Button>}
        </footer>
      </div>
    </div>
  );
}
