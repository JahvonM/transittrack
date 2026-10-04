# Passenger directory, roadside pickup and printable cards

Email accounts with staff/passenger roles appear in the passenger directory. Admins can see unassigned accounts; company managers see approved members of their own company. Card issuance requires an approved company membership. Bus assignment for email accounts is stored in protected CompanyMembership, never trusted from a self-editable User profile. Existing same-company contacts merge by normalized email. Directory responses omit card UIDs and credentials.

Passenger app: My pickup → Find a roadside pickup. GPS or address search finds nearby points on fetched road geometry for configured company routes (at least two stops), then requests walking directions. The user previews and explicitly saves a separate home location and roadside pickup. No shared route or stop is automatically edited. Dispatch must confirm stopping safety and walking accessibility. This does not establish a road as a main road or repair inaccurate Mapbox roads. Without a reachable walking route, the existing pickup is preserved.

Driver app: fresh boarding events appear in a full-screen ID-card overlay, queued in order and dismissed manually or after six seconds. Old initial-heartbeat events are not replayed. No card UID or PIN is displayed.

Admin: Fleet Operations → Card designer (/admin/card-designs). Company dashboard: Card designer tab. Select a passenger, customize front/back text, colors and raster logo/photo/background. Export PNG (1011 × 638 pixels) or print at 85.6 × 53.98 mm, actual size/100%. Templates are saved on the current computer per user. Artwork does not encode chip credentials; NFC issuance is a separate action.

Validation: 314 unit tests pass; 10 selected mocked browser tests pass, including directory links, PNG dimensions, boarding queue and separate home/pickup save. Lint and build pass. The browser GPS success callback is mocked deterministically; real GPS permissions/hardware, Grenada walking paths, printers and live NFC devices were not tested. No live records or devices changed and frontend was not published. Existing security blockers are not cleared by this feature work.
