// Plain-English help for Admin → App errors.

// "Android phone · Chrome", from the browser's own description.
export function describeDevice(ua = "") {
  const device = /iPad/.test(ua) ? "iPad"
    : /iPhone/.test(ua) ? "iPhone"
    : /Android/.test(ua) ? (/Mobile/.test(ua) ? "Android phone" : "Android tablet")
    : /Windows/.test(ua) ? "Windows computer"
    : /Macintosh/.test(ua) ? "Mac"
    : /Linux/.test(ua) ? "Linux computer" : "Unknown device";
  const browser = /SamsungBrowser/.test(ua) ? "Samsung Internet"
    : /Edg\//.test(ua) ? "Edge"
    : /Firefox|FxiOS/.test(ua) ? "Firefox"
    : /; wv\)/.test(ua) ? "inside the TransitTrack app"
    : /CriOS|Chrome/.test(ua) ? "Chrome"
    : /Safari/.test(ua) ? "Safari" : "";
  return browser ? `${device} · ${browser}` : device;
}

// What an error most likely means, in plain words.
export function errorHint(message = "") {
  if (/Loading chunk|dynamically imported module|Importing a module script failed|Failed to fetch dynamically/i.test(message))
    return "The app was updated while this person had it open, so a screen couldn't load. The app now reloads itself once when this happens, so you'll only see it if that reload didn't help (for example a weak connection). If it keeps coming back, send it to Claude.";
  if (/Network ?Error|Failed to fetch|Load failed|NetworkError|timeout/i.test(message))
    return "The device lost its connection to the server. Usually a weak signal; it only needs fixing if it keeps happening on good Wi-Fi.";
  if (/Quota|storage is full|exceeded the quota/i.test(message))
    return "The device's storage is full, so the app couldn't save something. Freeing space on the device fixes it.";
  if (/NotAllowedError|Permission denied|permission/i.test(message))
    return "The person said no to a permission (camera, location, microphone or notifications), or the device blocked it.";
  if (/Cannot read properties of (undefined|null)|is not a function|is not defined|undefined is not an object/i.test(message))
    return "A screen expected some information that wasn't there. This needs a fix in the app: copy the details below and send them to Claude.";
  return "Copy the details below and send them to Claude to look into.";
}
