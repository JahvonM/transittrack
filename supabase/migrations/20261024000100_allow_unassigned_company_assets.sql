-- Generated schema alignment for optional company assignments.
-- Allows retained vehicles and routes to be unassigned after company removal.
alter table public.route drop constraint if exists route_company_id_required;
alter table public.vehicle drop constraint if exists vehicle_company_id_required;
