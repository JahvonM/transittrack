import json, re

def sub(f, old, new, count=1):
    s = open(f).read()
    if old not in s:
        raise SystemExit(f"MISSING in {f}: {old[:70]}")
    s = s.replace(old, new, count)
    open(f, "w").write(s)

# Logo: local black+lime icon instead of the old JPEG
open("src/components/Logo.jsx", "w").write('''import React from "react";

export const LOGO_URL = "/brand/icon.svg";

export default function Logo({ className = "w-8 h-8" }) {
  return (
    <img
      src={LOGO_URL}
      alt="TransitTrack"
      className={`${className} rounded-[28%] shrink-0 object-contain`}
    />
  );
}
''')

sub("src/components/AppLayout.jsx", "MCSween's Transport</span>", "TransitTrack</span>")
sub("src/pages/Welcome.jsx", "            MCSween's Transport\n", "            TransitTrack\n")
sub("src/pages/Welcome.jsx", '"Welcome to Transit Hub"', '"Welcome to TransitTrack"')
sub("src/pages/CompanyDashboard.jsx",
    "if (!company) return <AppLayout><CreateCompany onCreated={loadAll} /></AppLayout>;",
    "if (!company) return <CreateCompany onCreated={loadAll} />;")

# index.html: title + icons + manifest
s = open("index.html").read()
s = re.sub(r'<link rel="icon"[^>]*/>', '<link rel="icon" type="image/svg+xml" href="/brand/icon.svg" />\n    <link rel="icon" type="image/png" sizes="32x32" href="/brand/favicon-32.png" />', s)
s = re.sub(r'<link rel="apple-touch-icon"[^>]*/>', '<link rel="apple-touch-icon" href="/brand/apple-touch-icon.png" />', s)
s = s.replace('<link rel="manifest" href="/manifest.json" />', '<link rel="manifest" href="/manifest.webmanifest" />')
s = s.replace("<title>MCSween's Transport and Reside Co.</title>", "<title>TransitTrack</title>")
if 'apple-mobile-web-app-title' not in s:
    s = s.replace("<title>TransitTrack</title>", '<meta name="apple-mobile-web-app-title" content="TransitTrack" />\n    <meta name="application-name" content="TransitTrack" />\n    <title>TransitTrack</title>')
open("index.html", "w").write(s)

manifest = {
    "name": "TransitTrack",
    "short_name": "TransitTrack",
    "description": "Live fleet tracking, bus boarding and driver tools.",
    "start_url": "/",
    "scope": "/",
    "display": "standalone",
    "background_color": "#0B0B0D",
    "theme_color": "#0B0B0D",
    "icons": [
        {"src": "/brand/icon-192.png", "type": "image/png", "sizes": "192x192", "purpose": "any"},
        {"src": "/brand/icon-512.png", "type": "image/png", "sizes": "512x512", "purpose": "any"},
        {"src": "/brand/maskable-512.png", "type": "image/png", "sizes": "512x512", "purpose": "maskable"},
        {"src": "/brand/icon.svg", "type": "image/svg+xml", "sizes": "any", "purpose": "any"},
    ],
}
open("public/manifest.webmanifest", "w").write(json.dumps(manifest, indent=2) + "\n")

cap = json.load(open("capacitor.config.json"))
txt = open("capacitor.config.json").read().replace('"backgroundColor": "#0f172a"', '"backgroundColor": "#0B0B0D"')
open("capacitor.config.json", "w").write(txt)
print("brand ok")
