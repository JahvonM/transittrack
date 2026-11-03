// TransitTrack photo-based 360 bus gallery backend.
// Requires vehicle_3d_scan and vehicle_3d_photo tables and private photo bucket.
// Supabase secrets are used only inside this Edge Function.
import { createClient } from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL") || "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SECRET = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const PHOTOS_BUCKET = "vehicle-3d-photos";
const MAX_PHOTOS = 36;
const SAFE_IMAGE_MIME = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic", "image/heif": ".heif" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const respond = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: { ...corsHeaders, "cache-control": "no-store" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "POST required" }, 405);
  if (!URL || !ANON || !SECRET) return respond({ error: "Backend not configured" }, 503);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return respond({ error: "Sign-in required" }, 401);

  const userClient = createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) return respond({ error: "Invalid session" }, 401);
  const uid = authData.user.id;
  const admin = createClient(URL, SECRET, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    const body = await req.json();
    const action = String(body?.action || "");
    const vehicleId = String(body?.vehicleId || "");
    const scanId = String(body?.scanId || "");
    const fileId = String(body?.fileId || "");

    async function allowed(companyId: string): Promise<boolean> {
      const { data: profile, error } = await admin.from("app_user").select("id,role,disabled").eq("auth_user_id", uid).maybeSingle();
      if (error || !profile || profile.disabled || !["admin","company","mechanic"].includes(profile.role)) return false;
      const { data: memberships, error: membershipError } = await admin.from("company_membership")
        .select("active,expires_at").eq("user_id", profile.id).eq("company_id", companyId).eq("active", true);
      if (membershipError) return false;
      return (memberships || []).some((m) => {
        if (!m.expires_at) return true;
        const expires = Date.parse(m.expires_at);
        return Number.isFinite(expires) && expires > Date.now();
      });
    }

    async function scanAccess(id: string) {
      if (!UUID.test(id)) return null;
      const { data: scan, error } = await admin.from("vehicle_3d_scan").select("*").eq("id", id).maybeSingle();
      if (error || !scan || !(await allowed(scan.company_id))) return null;
      return scan;
    }

    if (action === "create") {
      if (!vehicleId || vehicleId.length > 128) return respond({ error: "Invalid vehicle" }, 400);
      const { data: vehicle } = await admin.from("vehicle").select("id,company_id").eq("id", vehicleId).maybeSingle();
      if (!vehicle?.company_id || !(await allowed(vehicle.company_id))) return respond({ error: "Vehicle unavailable" }, 403);
      const { data, error } = await admin.from("vehicle_3d_scan")
        .insert({ vehicle_id: vehicle.id, company_id: vehicle.company_id, created_by: uid, status: "draft" })
        .select("id,status,created_at").single();
      if (error) throw error;
      return respond({ scan: data }, 201);
    }

    if (action === "list") {
      if (!vehicleId || vehicleId.length > 128) return respond({ error: "Invalid vehicle" }, 400);
      const { data: vehicle } = await admin.from("vehicle").select("id,company_id").eq("id", vehicleId).maybeSingle();
      if (!vehicle?.company_id || !(await allowed(vehicle.company_id))) return respond({ error: "Vehicle unavailable" }, 403);
      const { data, error } = await admin.from("vehicle_3d_scan").select("id,status,photo_count,created_at,updated_at")
        .eq("vehicle_id", vehicle.id).eq("company_id", vehicle.company_id).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return respond({ scans: data || [] });
    }

    if (action === "signPhoto") {
      const scan = await scanAccess(scanId);
      if (!scan || scan.created_by !== uid) return respond({ error: "Scan unavailable" }, 403);
      if (!["draft","capturing","uploading"].includes(scan.status)) return respond({ error: "Scan not accepting photos" }, 409);
      if (!UUID.test(fileId)) return respond({ error: "Invalid photo ID" }, 400);
      const mime = String(body?.contentType || "").toLowerCase();
      const extension = SAFE_IMAGE_MIME[mime as keyof typeof SAFE_IMAGE_MIME];
      const bytes = Number(body?.bytes);
      if (!extension || !Number.isSafeInteger(bytes) || bytes <= 0 || bytes > 20 * 1024 * 1024) return respond({ error: "Invalid image size/type" }, 400);
      const { count, error: countError } = await admin.from("vehicle_3d_photo").select("id", { count: "exact", head: true }).eq("scan_id", scan.id);
      if (countError) throw countError;
      if ((count || 0) >= MAX_PHOTOS) return respond({ error: "Photo limit reached" }, 409);
      const path = `${scan.id}/${fileId}${extension}`;
      // The generated signed URL permits writing only this path. The browser
      // never receives service credentials and cannot choose a different path.
      const { data, error } = await admin.storage.from(PHOTOS_BUCKET).createSignedUploadUrl(path, { upsert: false });
      if (error) throw error;
      return respond({ path, token: data.token, signedUrl: data.signedUrl, bucket: PHOTOS_BUCKET });
    }

    if (action === "confirmPhoto") {
      const scan = await scanAccess(scanId);
      if (!scan || scan.created_by !== uid) return respond({ error: "Scan unavailable" }, 403);
      if (!["draft","capturing","uploading"].includes(scan.status)) return respond({ error: "Scan not accepting photos" }, 409);
      const mime = String(body?.contentType || "").toLowerCase();
      const extension = SAFE_IMAGE_MIME[mime as keyof typeof SAFE_IMAGE_MIME];
      const bytes = Number(body?.bytes);
      const capturePass = String(body?.pass || "");
      if (!UUID.test(fileId) || !extension || !Number.isSafeInteger(bytes) || bytes <= 0 || bytes > 20 * 1024 * 1024 || !["lower","middle","upper"].includes(capturePass)) return respond({ error: "Invalid photo metadata" }, 400);
      const path = `${scan.id}/${fileId}${extension}`;
      const { data: stored, error: storageError } = await admin.storage.from(PHOTOS_BUCKET).info(path);
      if (storageError || !stored) return respond({ error: "Photo upload not found" }, 409);
      if (stored.size !== bytes) return respond({ error: "Uploaded size mismatch" }, 409);
      const { count } = await admin.from("vehicle_3d_photo").select("id", { count: "exact", head: true }).eq("scan_id", scan.id);
      if ((count || 0) >= MAX_PHOTOS) return respond({ error: "Photo limit reached" }, 409);
      const { error } = await admin.from("vehicle_3d_photo").insert({ id: fileId, scan_id: scan.id, object_path: path, capture_pass: capturePass, bytes, content_type: mime });
      // Never allow a scan owner to overwrite another scan's photo metadata.
      if (error?.code === "23505") {
        const { data: existing } = await admin.from("vehicle_3d_photo").select("scan_id,object_path").eq("id", fileId).maybeSingle();
        if (existing?.scan_id !== scan.id || existing?.object_path !== path) return respond({ error: "Photo ID conflict" }, 409);
      } else if (error) throw error;
      const { count: actualCount } = await admin.from("vehicle_3d_photo").select("id", { count: "exact", head: true }).eq("scan_id", scan.id);
      await admin.from("vehicle_3d_scan").update({ photo_count: actualCount || 0, status: "uploading", updated_at: new Date().toISOString() }).eq("id", scan.id);
      return respond({ confirmed: true, count: actualCount || 0 });
    }

    if (action === "photoLinks") {
      const scan = await scanAccess(scanId);
      if (!scan) return respond({ error: "Gallery unavailable" }, 403);
      const { data: photos, error } = await admin.from("vehicle_3d_photo")
        .select("id,object_path,created_at,capture_pass")
        .eq("scan_id", scan.id).order("created_at", { ascending: true }).order("id", { ascending: true }).limit(36);
      if (error) throw error;
      // URLs expire after five minutes and are only issued after company access checks.
      const frames = [];
      for (const photo of photos || []) {
        const { data: link, error: linkError } = await admin.storage.from(PHOTOS_BUCKET)
          .createSignedUrl(photo.object_path, 300);
        if (linkError) throw linkError;
        frames.push({ id: photo.id, url: link.signedUrl, createdAt: photo.created_at });
      }
      return respond({ frames, expiresIn: 300 });
    }

    return respond({ error: "Unknown action" }, 400);
  } catch (_error) {
    // Never return SQL errors, credentials, URLs or private schema details.
    return respond({ error: "3D Studio backend request failed" }, 500);
  }
});
