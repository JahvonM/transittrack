# Mapbox routing and passenger ETA improvements

Driver navigation requests alternatives from Mapbox's driving-traffic profile,
falling back to driving. Each valid returned route keeps its own geometry,
steps, duration and distance. Grey alternatives appear on both map engines;
route buttons select the active instructions and ETA. Selection resets route
projection and voice prompt state. Older overlapping requests cannot replace
newer results. Mapbox may return only one route.

Passenger arrival estimates route through the remaining ordered stops instead
of directly to pickup. Learned stop-to-stop times retain precedence when data
is sufficient. Missing GPS timestamps, locations older than two minutes, and
timestamps more than 30 seconds ahead suppress the arrival estimate. Failed
road estimates show ETA unavailable instead of straight-line/current-speed
times. Road estimates explicitly warn that stop waits can add time.

Validation: 301 unit tests pass, including five new routing/ETA tests. Four
mocked tablet browser tests pass, including selecting an alternate route and
observing its own ETA. Lint and build pass. No real route API comparison,
tablet mutation, publication or OSM map edit was performed.

Limits: remaining-stop progress still projects onto lines between stops; loops,
parallel roads and stops far from actual roads need field validation. Candidate
bus selection still uses straight-line proximity. Passenger road fallback uses
ordinary driving estimates, not traffic/dwell-adjusted times. More than 25
waypoints cannot be routed in one existing request and shows unavailable.
Missing roads/turn restrictions require provider data corrections; this change
does not prove Grenada road coverage or travel-time accuracy. Saved preferred
road paths and a road-data correction workflow remain future work. Existing
security release blockers are unaffected.
