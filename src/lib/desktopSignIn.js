// TransitTrack Desktop (Windows) signs in with Google/Apple through the
// person's own web browser, because those providers refuse to sign in inside
// an app window. The desktop app opens
//   /desktop-signin?port=<loopback port>&state=<random>&provider=<name>
// in the browser and listens once on http://127.0.0.1:<port>/callback
// (RFC 8252 loopback redirect). After the person signs in here and confirms,
// this page posts the session to that listener with the same random state.
// The desktop app rejects anything without its state, so another site cannot
// sign the desktop app in or out.

export const DESKTOP_PROVIDERS = {
  google: "Google",
  apple: "Apple",
  microsoft: "Microsoft",
  facebook: "Facebook",
  sso: "your organization",
};

const STORAGE_KEY = "base44_access_token";

// Validated request from the address bar, or null when the link is not one the
// desktop app could have made.
export function readDesktopSignIn(search) {
  const q = new URLSearchParams(search || "");
  const port = q.get("port") || "";
  const state = q.get("state") || "";
  const provider = q.get("provider") || "google";
  if (!/^[0-9]{4,5}$/.test(port)) return null;
  const portNumber = Number(port);
  if (portNumber < 1024 || portNumber > 65535) return null;
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(state)) return null;
  if (!Object.prototype.hasOwnProperty.call(DESKTOP_PROVIDERS, provider)) return null;
  return { port: portNumber, state, provider };
}

// Same-origin path back to this page (used as the provider's return address).
export function desktopSignInPath({ port, state, provider }) {
  return "/desktop-signin?" + new URLSearchParams({ port: String(port), state, provider }).toString();
}

export function desktopCallbackUrl({ port }) {
  return "http://127.0.0.1:" + Number(port) + "/callback";
}

// The browser's current TransitTrack session token (null when signed out).
export function currentSessionToken(storage, fallback = null) {
  let token = null;
  try {
    token = storage ? storage.getItem(STORAGE_KEY) : null;
  } catch {
    /* storage blocked */
  }
  return token || fallback || null;
}

// Post the session to the desktop app's one-time listener on this computer.
// A top-level form POST (not fetch) so it works without CORS and the token
// never appears in the browser history or address bar.
export function sendSessionToDesktop(request, token, doc = document) {
  const form = doc.createElement("form");
  form.method = "POST";
  form.action = desktopCallbackUrl(request);
  form.enctype = "application/x-www-form-urlencoded";
  form.style.display = "none";
  for (const [name, value] of [["state", request.state], ["token", token]]) {
    const input = doc.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  doc.body.appendChild(form);
  form.submit();
  return form;
}
