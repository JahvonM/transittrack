# Vehicle 3D reconstruction worker — staged prototype

This is a **separate GPU-capable Python worker**. It is not a browser process, a static Cloudflare asset, or a Supabase Edge Function.

## Requirements

* A test workstation with enough GPU memory and free disk space for whole-bus photogrammetry.
* Meshroom's CLI executable `meshroom_photogrammetry` and a working textured OBJ output pipeline.
* Blender 4.x command-line executable.
* Python 3.11 or later, plus dependencies in `requirements.txt`.
* Access to isolated staging PostgreSQL and private Supabase Storage.

## Configuration

Set the environment variables VEHICLE3D_DATABASE_URL, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in a private worker environment. Optionally set MESHROOM_BIN and BLENDER_BIN to executable paths.

Run `python worker.py --once` to claim at most one approved job. Never put credentials in the repository, client application, or log files.

The installed Meshroom version, mesh output layout, Blender OBJ importer and HEIC support require hands-on validation. Do not treat this as a production-ready processing service until tested on actual bus photos.

## Job lifecycle

The authenticated API verifies fleet membership and minimum capture coverage, and atomically queues the job after a deliberate user action. A single worker claims a queued job with PostgreSQL row locking, downloads only photos attached to that scan, runs photogrammetry, converts the mesh to GLB, uploads the result privately, and records the model. Failures become visible without automatic reprocessing.

## Release blockers

Test all authorization boundaries and photo provenance, cap processing costs/concurrency, implement lost-worker recovery, pin a known-good worker image, test GLB downloads, confirm device performance, and complete an end-to-end real-bus trial. Nothing in the pull request is deployed to a live environment.
