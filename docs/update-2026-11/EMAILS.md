# Emails (2 Nov 2026)

Every email the app sends goes through Admin → Notifications. There, each kind
can be switched off, switched off for one company, or left off for particular
people. Every send is listed under Recent.

The first five below went live with PR #20 on 2 Nov. The next five (branch
`more-emails`) are live only once their pull request is approved and merged.

## New emails to the person themselves

| Email | When | Notes |
|---|---|---|
| **Welcome** ("Your account is ready") | A new account finishes its first sign-in (email, Google or Apple). | Passengers get the next steps: join your company, add the app to the Home Screen, allow alerts, set a pickup spot. Only for accounts made after 2 Nov 2026 05:00 UTC, so existing people get nothing. Never sent to a driver's internal sign-in name. |
| **Sign-up day setup email** ("Set up your bus app for …") | The office adds someone with an email address on Admin → Sign-up day (ticked by default). Also when importing a list (ticked by default), or with **Email the setup link** / **Send the setup email again** on a person's page. | It has a personal link that joins that hotel once the person signs in with **that same email address**. A forwarded email can't join anyone else. The hotel's company code is never emailed. The link lasts 14 days, and a new one cancels the old one. Not sent to people who have already signed in. It can be sent again after 2 minutes. The hotel needs a join code (Admin → Companies). |
| **Password changed** | 1) A password reset with the email link: the email goes out at the next sign-in on that same browser. 2) A driver changes their own password. 3) The office resets a driver's password. | Never includes a password. Drivers get it only if their driver record has a real email address. |
| **Reply to my request (email)** | The office answers a passenger's request or changes its status (Passenger support). | Has the whole reply. Passengers can turn it off in their own notification settings, next to the phone alert. |
| **Bus card changes** | The office issues or replaces a card, pauses it, marks it lost or stopped, or switches it back on. | Shows only the last four characters of the card. Not sent when the passenger reports their own card lost; the app confirms that on screen. |
| **Office access given** | Someone is made an administrator, company manager or mechanic in Users & roles, or given a custom role. | Says what they can now open. Role changes in Users & roles are now saved by the server (admins only), which sends it. No email for hotel staff or driver roles, or when the role doesn't change. |
| **Bus or pickup changed by the office** | The office moves a passenger to another bus or takes them off one (Passenger directory), or moves a pickup spot they already had. | Not for a first pickup spot (usually set with them there, on a sign-up day). |
| **Bus card ending soon** | Once, when a card has 14 days or fewer left before its end date. Checked each morning with the maintenance reminders, so no new schedule was added. | Once per end date; a renewed card with a new date is told again. Only the last four characters of the card are shown. |
| **Driver app account created** | The office creates a driver's phone app account. | Their username and how to sign in. Never the temporary password, which the office gives in person. Only if the driver record has a real email. |
| **New sign-in** | An account signs in on a phone or browser it hasn't used before. | Not for an account's first device (so nobody gets one when this goes live), not on a new account's first day, and not for the same kind of phone or browser again (for example after clearing browser data). At most three a day. Only a hash of the browser's random id is kept, in the new `sign_in_device` table. |

## Emails that already existed (unchanged)

To the office:
- website ride request;
- company job request;
- passenger request or problem;
- new account created;
- crash alert;
- weekly report;
- maintenance due;
- inspection reminder.

To people:
- replies to ride requests (with the tracking link);
- going home: company pickup;
- your bus is approaching.

Sign-up codes and the reset-password email itself come from the sign-in service (Base44), not from the app.

## What this branch changes

- **New shared modules:**
  - `base44/shared/accountEmails.ts`: the emails and the safe-address check;
  - `base44/shared/signupInvites.ts`: the personal setup links. Only a SHA-256 hash of each link's key is kept, in `VerificationGrant` (purpose `signup_invite`).
- **New function `accountEmails`**: the password-changed email after a reset link. It writes only to the signed-in account's own address, at most once an hour.
- **`companyAccess` "verify"**: accepts a setup link instead of a code. It refuses it if the signed-in email doesn't match, the link has expired, or the hotel's code has changed.
- **One additive migration**, `20261102050352_account_emails.sql`, adding:
  - `signup_alert.welcome_sent_at`;
  - `signup_help.invite_sent_at`;
  - `signup_help.invite_sent_by`.

  Undo (only after rolling the app back):

  ```sql
  alter table public.signup_alert drop column if exists welcome_sent_at;
  alter table public.signup_help drop column if exists invite_sent_at, drop column if exists invite_sent_by;
  ```

## The second five (branch `more-emails`)

- **`accessRoles`**: a new admin-only `set_user_role` action, which Users & roles now uses instead of changing the role from the browser. `assign` (custom roles) also sends the email.
- **`nfcCards`**: `set_bus` and `set_pickup` email the passenger after saving.
- **`maintenanceAlerts`**: also runs `base44/shared/cardExpiry.ts` each morning.
- **`driverAccounts` `provision`**: sends the account email.
- **`accountEmails`**: a new `signed_in` action. The app calls it once per browser session after sign-in (`src/lib/signInDevice.js`).
- **One additive migration**, `more_account_emails`: the `sign_in_device` table (server-only) and `nfc_card.expiry_notice_for`.

  Undo (only after rolling the app back):

  ```sql
  drop table if exists public.sign_in_device;
  alter table public.nfc_card drop column if exists expiry_notice_for;
  ```

## Device tests (none could be run here)

| # | Test | Pass when |
|---|---|---|
| M1 | Create a new account with a real inbox. | "Welcome to McSween Transport" arrives once; Admin → Notifications → Recent lists it |
| M2 | Sign-up day: add yourself with a real email, ticked. Open the email on an iPhone and tap Set up the app, then create the account with that address. | The app opens on the hotel without asking for a code |
| M3 | Forward that email to another address and try it signed in as that address. | "This setup link was sent to a different email address." Not joined |
| M4 | Forgot password → reset with the link → sign in. | "Your password was changed" arrives once |
| M5 | Answer a passenger request in Passenger support. | The passenger gets the email with the whole reply |
| M6 | Pause a test card, then switch it back on. | Two emails, each showing only "card ending …" |
| M7 | Switch one of these off in Admin → Notifications and repeat it. | No email; Recent shows it as off |
| M8 | Users & roles: make a test account a mechanic. | "Your McSween Transport access has changed" arrives |
| M9 | Move a test passenger to another bus, then move their pickup spot. | Two emails, each naming the new bus or spot |
| M10 | Give a test card an end date 10 days away and wait for the next morning (11:00 UTC). | "Your bus card ends soon" arrives once |
| M11 | Sign in to a test account (used for more than a day) on a different kind of phone or browser. | "New sign-in" arrives, naming that phone or browser |
