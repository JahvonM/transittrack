# TransitTrack — Handoff

## 1) Goal

Fleet/transit tracking PWA (driver, staff, admin, company/manager, and now
mechanic roles) built on Base44. Recent work stream: turn the driver app's
messaging into a WhatsApp-style experience — one chat tab with separate
contacts (Staff / Own company / Dispatch / Mechanic), edit/delete on your own
messages, photo + voice notes, and an admin floating chat bubble — as part of
getting the app ready for real-world use and eventual Play Store / App Store
publishing.

## 2) Current state

- The WhatsApp-style chat merge is built and deployed (live at
  `https://eager-transit-track-go.base44.app`):
  - Driver app's old "Messages" (dispatch broadcasts) and "Chat" (staff)
    tabs are merged into one "Chat" tab → `DriverChats.jsx`, a contact list
    with 4 threads: **Staff**, **Own company**, **Dispatch**, **Mechanic**.
  - All four threads share one entity (`GroupMessage`) split by a new
    `channel` field, with edit/delete on your own messages, and photo/voice
    note support everywhere (driver, staff, admin, company, mechanic).
  - New **Mechanic** role: admin can create one under Users & roles; it logs
    into its own portal at `/mechanic`.
  - New **CompanyMessages** floating bubble on the Fleet Manager dashboard
    (company/owner login) — the other end of the driver's "Own company"
    contact.
  - Admin's `FloatingMessages` bubble now has a per-vehicle channel switcher
    (Staff / Company / Dispatch / Mechanic) instead of one flat thread.
  - Push notifications fire to admin (always) plus the channel-specific
    audience (company manager for "company" channel, mechanic team for
    "mechanic" channel), with the sender's own device excluded so people
    don't get pushed about their own message.
- Last user-facing ask in progress: admin's chat bubble should sit stacked
  **above** the AI copilot button (both bottom-right), not on opposite
  corners. This was implemented and verified directly in the deployed
  bundle/CSS (both buttons confirmed `right-4`, stacked at `bottom-4` /
  `bottom-24`) — **but the user is still seeing it on the left after a
  refresh**, unresolved as of this handoff. See "Failed attempts" below.

## 3) Active files

Backend (Base44 functions/entities):
- `base44/functions/driverSession/entry.ts` — driver's single backend
  entrypoint (device-paired, no login). Channel-aware `send_group_message`,
  new `send_chat_media` (base64 upload via `asServiceRole.integrations.Core.UploadFile`),
  `edit_group_message`/`delete_group_message`, `pushTokensForChannel` helper,
  legacy `send_broadcast`/`sos`/`update_location`/etc. unchanged.
- `base44/functions/notifyAdminMessage/entry.ts` — push trigger called by
  logged-in roles (staff/company/admin/mechanic) right after they create a
  `GroupMessage` directly via the client SDK (driver's own sends push inline
  from `driverSession` instead). Now channel-aware and excludes the sender's
  own device from the push.
- `base44/entities/GroupMessage.jsonc` — `channel` enum
  (staff/company/dispatch/mechanic), `sender_role` enum now includes
  company/mechanic, `message_type` (text/image/audio) + `media_url`, RLS
  updated per channel.
- `base44/entities/User.jsonc` — `role` enum now includes `mechanic`.
- `base44/entities/PushToken.jsonc` — unchanged schema, just now also holds
  `role: "company"` / `role: "mechanic"` rows.

Frontend — shared:
- `src/components/chat/ChatThread.jsx` — the one reusable chat UI (bubbles,
  edit/delete, image/audio rendering, input row with photo picker + voice
  recorder via `MediaRecorder`). Every role's chat UI wraps this.
- `src/lib/chatMedia.js` — `blobToBase64()`, used only by the driver (no
  login → can't call `UploadFile` directly, so it base64-encodes and goes
  through `driverSession`'s `send_chat_media`).

Frontend — per role:
- `src/components/driver/DriverChats.jsx` — new; driver's 4-contact list.
- `src/pages/DriverApp.jsx` — tab bar reduced from 6 to 5 tabs (Messages tab
  removed), `DriverChats` wired into "Chat" tab, `handleAlertReply` now posts
  to `channel: "dispatch"` instead of the old `send_broadcast`.
- `src/components/staff/StaffGroupChat.jsx` — rewritten to use `ChatThread`,
  explicit `channel: "staff"` filter/create.
- `src/components/admin/FloatingMessages.jsx` — rewritten: vehicle list →
  channel list → thread, using `ChatThread`. Bubble position:
  `fixed bottom-24 right-4` (button), `fixed bottom-40 right-4` (panel) —
  stacked above `FloatingChatbot` (`fixed bottom-4 right-4` /
  `fixed bottom-20 right-4`).
- `src/components/manager/CompanyMessages.jsx` — new; same pattern, single
  `channel: "company"` scope, wired into `ManagerDashboard.jsx` for
  `role === "company"` only (admin has its own richer panel already).
- `src/pages/MechanicPortal.jsx` — new; full-page vehicle list → thread,
  `channel: "mechanic"`, routed at `/mechanic` in `src/App.jsx`.
- `src/components/admin/UsersTab.jsx` — added "Mechanic" to the 3 role
  `<Select>`s (invite, create-account dialog, per-user row).
- `src/pages/Welcome.jsx` — added `mechanic` to the `ROLES` map (icon
  `Wrench`, routes to `/mechanic`) so login redirect works.
- `src/pages/StaffPortal.jsx` — added a `role === "mechanic"` redirect guard
  alongside the existing driver/company ones.

Deleted (now dead, folded into `DriverChats`):
- `src/components/DriverMessages.jsx`
- `src/components/driver/DriverGroupChat.jsx`

## 4) Changes made

In order, across this stream of work:

1. `GroupMessage` + `User` entity schemas extended (channel/media fields,
   mechanic role); backfilled existing `GroupMessage` rows with
   `channel: "staff"`.
2. `driverSession/entry.ts`: channel param on send/edit/delete, new
   `send_chat_media` action, `pushTokensForChannel` helper, dispatch reply
   path switched from `Broadcast` to `GroupMessage(channel: "dispatch")`.
3. `notifyAdminMessage/entry.ts` generalized to be channel-aware (was
   staff-only before) and to exclude the sender's own push tokens.
4. Built `ChatThread.jsx` (shared UI) and `chatMedia.js` (base64 helper).
5. Built `DriverChats.jsx`, rewired `DriverApp.jsx`, deleted the two old
   driver chat components.
6. Rewrote `StaffGroupChat.jsx` on top of `ChatThread` with `channel:
   "staff"`.
7. Rewrote `FloatingMessages.jsx` (admin) with the vehicle → channel →
   thread drill-down.
8. Built `CompanyMessages.jsx`, wired into `ManagerDashboard.jsx`.
9. Built `MechanicPortal.jsx`, added the `/mechanic` route, `mechanic` role
   everywhere it needed to be recognized (User schema, Welcome redirect,
   StaffPortal guard, UsersTab role pickers).
10. Build verified clean (`npx vite build`), checkpointed, deployed.
11. Follow-up: moved admin's `FloatingMessages` bubble from
    `bottom-4 left-4` to `bottom-24 right-4` (stacked above
    `FloatingChatbot`), panel from `bottom-20 left-4` to `bottom-40
    right-4`. Rebuilt, checkpointed, deployed again.

## 5) Failed attempts

- **Chat bubble still reported on the left after the reposition deploy.**
  Verified directly against the live served files (not just local
  source) that the fix is actually live:
  - Fetched the deployed `Admin-*.js` chunk and confirmed the literal
    classes `fixed bottom-24 right-4 ... shadow-lg relative` and
    `fixed bottom-40 right-4 ...` are present, and `bottom-4 left-4` is
    gone.
  - Fetched the deployed CSS bundle and confirmed `.bottom-24`,
    `.bottom-40`, `.right-4` all have real rules generated (ruled out a
    Tailwind purge/stale-CSS gap).
  - Confirmed no custom domain is configured for this app (`GET
    .../custom-domains` → `[]`), so there's no second, possibly-stale
    origin the user could be hitting.
  - Told the user this points to a client-side cache (most likely an
    installed PWA/home-screen icon not picking up a plain in-tab refresh)
    and asked them to fully close-and-reopen the app or test in an
    incognito window. **No confirmation back yet that this resolved it** —
    this is the one open thread from this session.

## 6) Next step

- Get confirmation from the user on whether a full close-and-reopen (or
  incognito test) fixes the chat-bubble-position issue. If incognito also
  still shows it on the left, the "verified live" assumption above is wrong
  somewhere (e.g. a second published URL/branch, or a CDN edge that hadn't
  invalidated yet) and needs re-investigation — don't just re-apply the same
  positioning change again.
- Get user feedback on the WhatsApp-style chat merge itself (Staff / Own
  company / Dispatch / Mechanic contacts, photo/voice notes, edit/delete) —
  none received yet since it shipped.
- Still open from earlier in the session, never answered: how should the
  kiosk check-in/sign-in flow actually work (`StaffCheckIn`/
  `FrontDeskSignIns` entities have admin-facing log UI but nothing creates
  records — kiosks only show a static "paired" confirmation). Needs NFC vs
  QR vs manual-entry decision from the user.
- Native push notifications inside the Capacitor-wrapped iOS/Android shells
  (as opposed to today's web push, which works) still need two files from
  the user: `google-services.json` (Android) and `GoogleService-Info.plist`
  (iOS) — documented in `MOBILE.md`, not yet requested/provided.
- App Store / Play Store submission itself (signed binaries, store
  listings, real `appId` in place of the placeholder `com.transittrack.app`)
  is explicitly on hold per the user until "a few more things to debug" are
  done.

## Pre-production security — STEP 1 (2026-10-03)

User authorized STEP 1 only. No production resources exist. Mechanics require
maintenance access across companies, without credentials or ownership/role
controls. Advertisements stay publicly readable with authorized writes only.

Removed tracked helper signing material and the public legacy helper APK. The
existing development key remains at kiosk-helper/signing.jks as an ignored local
file (0600); legacy APK moved to ignored kiosk-helper/legacy-development/. Secure
external backup is still required before sandbox reset. No key generation, device
revocation, credential rotation, database rule changes, or deployment performed.

Helper build now requires an existing absolute-path keystore, alias and password
environment variables and never creates keys. FreeKiosk key fallback removed;
setup asks for validated local PIN/API-key/Wi-Fi credentials and explicitly passes
the API key to the helper. Setup uses a privately supplied local APK.

Earlier Git history and previously published files still contain old material;
this step changes the current repository only. Do not use exposed development
credentials for production. STEP 2 is not authorized yet. V1 remains unresolved:
built-in User security cannot be changed according to Base44 docs, and custom
profile fields are self-editable. Authenticated non-admin tests remain needed.
