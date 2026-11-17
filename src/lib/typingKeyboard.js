// Phones and tablets: keep the field being typed in visible above the
// on-screen keyboard, and mark the page while the keyboard is up
// (html[data-typing]) so bars pinned to the bottom of the screen step aside
// (.tt-hide-while-typing in index.css). Works with the viewport setting
// interactive-widget=resizes-content in index.html, which makes Android
// shrink the page instead of sliding the keyboard over it.

// Input types that never bring up the on-screen keyboard.
const NO_KEYBOARD = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]);

// A keyboard is at least this tall; smaller changes are the browser's own
// address bar sliding in and out.
export const KEYBOARD_MIN_PX = 120;

export function opensKeyboard(el) {
  if (!el || el.disabled || el.readOnly) return false;
  // Keypad screens (driver PIN) keep the phone keyboard closed on purpose.
  const mode = el.inputMode || el.getAttribute?.("inputmode");
  if (mode === "none") return false;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName === "INPUT") return !NO_KEYBOARD.has(String(el.type || "text").toLowerCase());
  return el.isContentEditable === true;
}

export function hasTouchScreen(win) {
  try {
    return (win.navigator?.maxTouchPoints || 0) > 0 || !!win.matchMedia?.("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

// True when the field is (partly) outside the part of the screen the
// keyboard leaves visible. `view` is window.visualViewport or the same shape.
export function hiddenByKeyboard(rect, view, margin = 12) {
  const top = view.offsetTop || 0;
  return rect.top < top + margin || rect.bottom > top + view.height - margin;
}

export function keyboardIsOpen(viewHeight, fullHeight) {
  return fullHeight - viewHeight >= KEYBOARD_MIN_PX;
}

export function installKeyboardHandling(win = window) {
  if (!win?.document || !hasTouchScreen(win)) return () => {};
  const doc = win.document;
  const root = doc.documentElement;
  const view = () => win.visualViewport || { height: win.innerHeight, offsetTop: 0 };
  let fullHeight = view().height;
  let timer = 0;

  const typing = () => opensKeyboard(doc.activeElement);
  const setTyping = (on) => {
    if (on) root.dataset.typing = "true";
    else delete root.dataset.typing;
  };
  const reveal = () => {
    const el = doc.activeElement;
    if (!opensKeyboard(el) || !hiddenByKeyboard(el.getBoundingClientRect(), view())) return;
    const still = win.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", inline: "nearest", behavior: still ? "auto" : "smooth" });
  };
  const check = () => {
    if (!typing()) return;
    setTyping(keyboardIsOpen(view().height, fullHeight));
    reveal();
  };

  const onFocusIn = (event) => {
    if (!opensKeyboard(event.target)) return;
    // The keyboard slides up over about 300ms; look again once it is open.
    win.clearTimeout(timer);
    timer = win.setTimeout(check, 350);
  };
  const onFocusOut = () => {
    win.setTimeout(() => { if (!typing()) setTyping(false); }, 0);
  };
  const onResize = () => {
    // Without a field in use, a new height is the screen itself (turning
    // the phone, split screen), so remember it as the keyboard-closed size.
    if (!typing()) { fullHeight = view().height; setTyping(false); return; }
    check();
  };

  doc.addEventListener("focusin", onFocusIn);
  doc.addEventListener("focusout", onFocusOut);
  const resizeTarget = win.visualViewport || win;
  resizeTarget.addEventListener("resize", onResize);
  return () => {
    win.clearTimeout(timer);
    doc.removeEventListener("focusin", onFocusIn);
    doc.removeEventListener("focusout", onFocusOut);
    resizeTarget.removeEventListener("resize", onResize);
    setTyping(false);
  };
}
