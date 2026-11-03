"""One-job-at-a-time 3D reconstruction worker (staging reference).

Requires a dedicated machine with Meshroom, Blender, adequate VRAM/disk,
a private database connection and Supabase Storage service credentials.
NEVER run this inside the static app or a Supabase Edge Function.

Only processes jobs explicitly queued after administrator approval.
No automatic retries (failed jobs remain failed for manual review).
"""
from __future__ import annotations

import argparse
import logging
import os
import pathlib
import shutil
import subprocess
import tempfile
import time
from datetime import datetime, timezone

import psycopg
from psycopg.rows import dict_row
from supabase import create_client

LOG = logging.getLogger("vehicle3d")
PHOTO_BUCKET = "vehicle-3d-photos"
MODEL_BUCKET = "vehicle-3d-models"
MIN_PHOTOS = 40
MAX_PHOTOS = 200

CLAIM_SQL = """
with candidate as (
  select j.id
  from public.vehicle_3d_job j
  join public.vehicle_3d_scan s on s.id = j.scan_id
  where j.status = 'queued' and s.status = 'queued'
  order by j.created_at, j.id
  for update of j skip locked
  limit 1
)
update public.vehicle_3d_job j
set status = 'processing', attempt_count = attempt_count + 1,
    updated_at = now()
from candidate where j.id = candidate.id
returning j.id, j.scan_id, j.attempt_count
"""

def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value

def run(args: list[str], *, timeout: int, cwd: pathlib.Path | None = None):
    LOG.info("Running %s", args[0])
    subprocess.run(args, check=True, timeout=timeout, cwd=cwd, stdin=subprocess.DEVNULL)

def claim(conn):
    with conn.transaction():
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(CLAIM_SQL)
            job = cur.fetchone()
            if job:
                cur.execute(
                    "update public.vehicle_3d_scan set status='processing', updated_at=now() where id=%s and status='queued'",
                    (job["scan_id"],),
                )
            return job

def process(conn, storage, job: dict, meshroom: str, blender: str, timeout_seconds: int):
    scan_id = str(job["scan_id"])
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """select object_path, capture_pass, bytes from public.vehicle_3d_photo
               where scan_id=%s order by created_at, id""",
            (scan_id,),
        )
        photos = cur.fetchall()
    if not (MIN_PHOTOS <= len(photos) <= MAX_PHOTOS):
        raise ValueError(f"Need {MIN_PHOTOS}-{MAX_PHOTOS} photos; received {len(photos)}")
    if {p["capture_pass"] for p in photos} != {"lower", "middle", "upper"}:
        raise ValueError("All three camera passes are required")

    # Each job has its own temporary directory; no shell=True or user-controlled paths.
    with tempfile.TemporaryDirectory(prefix="tt-3d-") as folder:
        root = pathlib.Path(folder)
        images = root / "images"
        output = root / "meshroom-output"
        images.mkdir()
        output.mkdir()
        for n, photo in enumerate(photos):
            path = str(photo["object_path"])
            # Prevent traversal and unexpected paths even if DB data was corrupted.
            if not path.startswith(scan_id + "/") or "/" in path[len(scan_id) + 1:]:
                raise ValueError("Invalid source photo path")
            ext = pathlib.Path(path).suffix.lower()
            if ext not in {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}:
                raise ValueError("Unsupported photograph extension")
            content = storage.storage.from_(PHOTO_BUCKET).download(path)
            if not isinstance(content, bytes) or len(content) != int(photo["bytes"]):
                raise ValueError("Photo not found or size differs from recorded upload")
            (images / f"{n:04d}{ext}").write_bytes(content)

        # Meshroom's photogrammetry pipeline performs SfM, meshing and texturing.
        # The installed CLI/version must be validated against a real bus scan.
        run([meshroom, "--input", str(images), "--output", str(output)], timeout=timeout_seconds)

        # Meshroom typically exports texturedMesh.obj with its texture files.
        meshes = sorted(output.rglob("*.obj"))
        if not meshes:
            raise RuntimeError("Meshroom did not produce a textured OBJ model")
        source = meshes[0]
        glb_path = root / "bus.glb"
        converter = pathlib.Path(__file__).with_name("mesh_to_glb.py")
        run([blender, "-b", "--python", str(converter), "--", str(source), str(glb_path)], timeout=900)
        if not glb_path.is_file() or glb_path.stat().st_size < 1024:
            raise RuntimeError("Blender GLB export was empty")
        if glb_path.stat().st_size > 150 * 1024 * 1024:
            raise RuntimeError("3D model exceeds 150MB viewer limit")

        model_path = f"{scan_id}/{job['id']}.glb"
        storage.storage.from_(MODEL_BUCKET).upload(
            model_path, glb_path.read_bytes(),
            file_options={"content-type": "model/gltf-binary", "upsert": "false"},
        )
        # Complete only after Storage reports a successful write.
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute(
                    """insert into public.vehicle_3d_model
                       (scan_id,object_path,file_size,generation_provider,quality_report)
                       values (%s,%s,%s,'meshroom',%s::jsonb)""",
                    (scan_id, model_path, glb_path.stat().st_size,
                     '{"pipeline":"meshroom+blender","quality":"unverified"}'),
                )
                cur.execute("update public.vehicle_3d_job set status='ready', updated_at=now() where id=%s and status='processing'", (job["id"],))
                cur.execute("update public.vehicle_3d_scan set status='ready', updated_at=now() where id=%s and status='processing'", (scan_id,))

def fail_job(conn, job, error: Exception):
    LOG.exception("3D reconstruction failed for job %s", job["id"])
    # Store a generic message; file paths and infrastructure details remain in worker logs.
    with conn.transaction():
        with conn.cursor() as cur:
            cur.execute(
                "update public.vehicle_3d_job set status='failed', error_message='Reconstruction failed; see worker logs', updated_at=now() where id=%s",
                (job["id"],),
            )
            cur.execute(
                "update public.vehicle_3d_scan set status='failed', error_summary='3D reconstruction failed', updated_at=now() where id=%s",
                (job["scan_id"],),
            )

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="Process at most one queued job")
    parser.add_argument("--interval", type=int, default=30)
    parser.add_argument("--timeout", type=int, default=10800)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    db_url = require_env("VEHICLE3D_DATABASE_URL")
    url = require_env("SUPABASE_URL")
    key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    meshroom = shutil.which(os.getenv("MESHROOM_BIN", "meshroom_photogrammetry"))
    blender = shutil.which(os.getenv("BLENDER_BIN", "blender"))
    if not meshroom or not blender:
        raise RuntimeError("Meshroom and Blender CLIs are required on the worker host")
    storage = create_client(url, key)
    with psycopg.connect(db_url, autocommit=True) as conn:
        while True:
            job = claim(conn)
            if job:
                try:
                    process(conn, storage, job, meshroom, blender, args.timeout)
                except Exception as exc:
                    fail_job(conn, job, exc)
            if args.once:
                break
            time.sleep(max(5, args.interval))

if __name__ == "__main__":
    main()
