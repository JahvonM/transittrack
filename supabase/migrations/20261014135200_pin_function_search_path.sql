-- The two helper functions only use built-ins: pin their search path so no
-- schema can slip in a look-alike function (Supabase security advisor 0011).
alter function public.new_id() set search_path = '';
alter function public.touch_updated_date() set search_path = '';
