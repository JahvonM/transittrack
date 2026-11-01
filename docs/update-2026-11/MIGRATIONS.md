# Database changes in this update, and how to undo them

Every change only **adds** columns, indexes or allowed values. No existing
data is moved, renamed or deleted, and older app versions keep working
against the new tables (they ignore the new columns).

Migrations apply automatically when `main` is deployed. Nothing here has
been applied to the live database yet.

| File | What it adds | Who writes it |
|---|---|---|
| `20261031194008_boarding_events.sql` | `kiosk_device.reader_mode` (`both` / `boarding` / `exit`, default `both`), `kiosk_device.require_active_trip` (default off), and on `staff_check_in`: `person_key`, `run_key`, `shift_id`, `review_reason`, `saved_offline`, plus an index on `shift_id` | `kioskCheckIn` only (server-only fields) |
| `20261101004614_card_states.sql` | `nfc_card.status` (`active` / `suspended` / `lost` / `revoked` / `replaced`), and three audit actions: `card_suspended`, `card_lost`, `card_reactivated` | `nfcCards` only |
| `20261101010408_passenger_cases.sql` | New table `passenger_case` (requests and support cases: reference, kind, status, the passenger's bus and trip context, replies), and `app_user.boarding_note` (help a passenger asks for when boarding, shown to their driver) | `passengerCases` only for cases; the passenger for their own boarding note |
| `20261101014114_ride_exceptions.sql` | New table `ride_exception`: a driver's marks (no-show, got on / got off without a tap), with who, when and the run; a got on / off also makes a `staff_check_in` with method `manual` and review reason `driver_correction` | `driverSession` only |

Existing cards are **not** back-filled. A card with no `status` is read from
what it already has (`is_active`, and "Replaced…" in the reason), see
`base44/shared/cardStatus.ts`. `is_active` stays the switch the tablets check.

## Undo

Roll the app back first (redeploy the previous `main`), then, only if the
columns must go, run in the Supabase SQL editor:

```sql
-- 20261101014114_ride_exceptions.sql (removes the drivers' no-show marks; their boarding records stay)
drop table if exists public.ride_exception;

-- 20261101010408_passenger_cases.sql (removes every passenger request and reply)
drop table if exists public.passenger_case;
alter table public.app_user drop column if exists boarding_note;

-- 20261101004614_card_states.sql
alter table public.nfc_card drop constraint if exists nfc_card_status_allowed;
alter table public.nfc_card drop column if exists status;
alter table public.audit_log drop constraint if exists audit_log_action_allowed;
-- Rows using the new actions must be changed first, or the old check fails.
update public.audit_log set action = 'card_revoked' where action in ('card_suspended', 'card_lost');
update public.audit_log set action = 'update' where action = 'card_reactivated';
alter table public.audit_log add constraint audit_log_action_allowed check (action is null or action in ('create', 'update', 'delete', 'card_programmed', 'card_verified', 'card_rejected', 'card_revoked')) not valid;

-- 20261031194008_boarding_events.sql
drop index if exists public.staff_check_in_shift_id_idx;
alter table public.staff_check_in drop column if exists person_key, drop column if exists run_key,
  drop column if exists shift_id, drop column if exists review_reason, drop column if exists saved_offline;
alter table public.kiosk_device drop constraint if exists kiosk_device_reader_mode_allowed;
alter table public.kiosk_device drop column if exists reader_mode, drop column if exists require_active_trip;
```

Dropping the columns loses only what this update recorded (review flags,
run keys, card states, passenger requests and boarding notes). Leaving them in place after an app rollback is
harmless, so the usual answer is: roll the app back and leave the columns.
A suspended card is `is_active = false`, so after a rollback it simply shows
as revoked.
