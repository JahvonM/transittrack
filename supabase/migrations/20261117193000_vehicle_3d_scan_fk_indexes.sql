-- Supabase's performance check flagged two links on 3D bus scans with no index
-- of their own. The existing (company_id, vehicle_id, created_at) index starts
-- with company_id, so it does not help lookups by bus or by the person who
-- made the scan, or deleting a bus or a user. Safe to run twice.
create index if not exists vehicle_3d_scan_vehicle_id_idx on public.vehicle_3d_scan(vehicle_id);
create index if not exists vehicle_3d_scan_created_by_idx on public.vehicle_3d_scan(created_by);
