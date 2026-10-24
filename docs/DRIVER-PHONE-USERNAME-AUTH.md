# Driver phone username/password authentication — implementation contract

Status: design and migration checklist only. Do not enable username sign-in until server-side provisioning, account verification, and tests are complete.

## Current system
- The driver phone signs in through the regular auth screen, which currently accepts email/password or OAuth.
- `base44/shared/driverPhone.ts` authorizes phone access by comparing a signed-in user's email with `Driver.email`.
- `driverVehicles()` assigns buses by comparing `Vehicle.driver_email` to `Driver.email`.
- The driver tablet/kiosk uses separate paired-device and PIN authentication; do not change it.

## Required security design
1. Add `Driver.username` (normalized, unique, case-insensitive) and `Driver.auth_user_id` (stable authentication account ID). Keep `Driver.id` as the stable business identity. Never store plaintext, encrypted, or hashed passwords on Driver records.
2. Provision accounts from a privileged server function, authenticated as an admin. Reject duplicate usernames; enforce minimum password strength, throttling, and audit logging. Never return a saved password or expose service-role credentials.
3. Supabase Auth requires an email identifier for email/password authentication. For email-less drivers, use an internal synthetic auth email based on the immutable driver ID, not a paid mailbox. Translate username to that identifier only through a rate-limited, enumeration-resistant server endpoint. Do not expose the internal email as a recovery address or send password-reset emails to it.
4. Require a first-login password change enforced server-side, not only by hiding app screens. Admin resets must revoke sessions, rotate credentials through the authentication admin API, and force another password change. Deactivation must revoke active sessions and deny driver-phone backend requests.
5. Authorize each driver-phone request using the signed-in auth user ID linked to Driver.auth_user_id and an active `phone_app_access` flag, never a caller-supplied driver ID or username. Prevent multiple active Driver records linking to one auth account.
6. Store `Vehicle.driver_id` as the authoritative bus assignment, with temporary fallback to `driver_email` for legacy records. Migrate assignments before removing the fallback. Existing DriverShift and other history must remain intact.
7. Keep kiosk pairing and PIN flows unchanged. Protect tenant isolation and admin-only account management.
8. Add tests for username uniqueness, sign-in throttling, first-login change, admin reset, disabled driver, ID-based assignments after email/username changes, legacy fallback, and cross-company access.

## Release gates
- Implement backend account provisioning and auth mapping before exposing username sign-in UI.
- Migrate existing driver assignments safely, then enable the new login behind a feature flag for two test drivers.
- Validate browser/mobile sign-in and all CI checks. Do not deploy until verified.
