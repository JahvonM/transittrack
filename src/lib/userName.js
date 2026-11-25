// The name to show for a person: the one they chose in My Account
// (User.display_name), falling back to the platform account name and then
// their email. The platform account name (full_name) is read-only, so a name
// someone types for themselves has to be stored on its own field.
export const accountName = (user) => (user?.display_name || user?.full_name || user?.email || "").trim();

// The first whole character of a word, as a person sees it: an emoji or an
// accented letter stays in one piece (word[0] would cut an emoji in half and
// show "�").
const graphemes = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
export function firstLetter(word) {
  const s = String(word || "");
  if (!s) return "";
  const first = graphemes ? graphemes.segment(s)[Symbol.iterator]().next().value?.segment : Array.from(s)[0];
  return (first || "").toUpperCase();
}

// Up to two initials for a name (or an email), "?" when there's nothing.
export const initialsOf = (name) =>
  String(name || "")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(firstLetter)
    .join("");

export const nameInitials = (user) => initialsOf(accountName(user) || "?") || "?";
// The name a greeting uses: the name the person set for themselves, exactly as
// they set it; otherwise the first name of their sign-in account (e.g. Google).
export const greetingName = (user) => {
  const chosen = String(user?.display_name || "").trim();
  if (chosen) return chosen;
  return String(user?.full_name || "").trim().split(/\s+/)[0] || "";
};
