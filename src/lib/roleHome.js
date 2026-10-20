// Where each kind of account lands after signing in. Welcome and App both use
// it, so App can send a signed-in person straight to their screen (and start
// downloading it) without opening the welcome page first.
const HOMES = {
  driver: "/driver-phone",
  company: "/company",
  staff: "/staff",
  admin: "/admin",
  mechanic: "/mechanic",
  kiosk_bus: "/kiosk",
  kiosk_driver: "/driver",
  reviewer_sandbox: "/reviewer-sandbox",
};

export function homeFor(user) {
  if (!user) return "/";
  if (user.access_role) return "/workspace";
  return HOMES[user.role || "staff"] || "/staff";
}
