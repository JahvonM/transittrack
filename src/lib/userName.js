// The name to show for a person: the one they chose in My Account
// (User.display_name), falling back to the platform account name and then
// their email. The platform account name (full_name) is read-only, so a name
// someone types for themselves has to be stored on its own field.
export const accountName = (user) => (user?.display_name || user?.full_name || user?.email || "").trim();

export const nameInitials = (user) =>
  (accountName(user) || "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("") || "?";