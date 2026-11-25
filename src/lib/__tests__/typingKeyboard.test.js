import { describe, expect, it, vi } from "vitest";
import { hasTouchScreen, hiddenByKeyboard, installKeyboardHandling, keyboardIsOpen, opensKeyboard } from "@/lib/typingKeyboard";

const field = (props) => ({ tagName: "INPUT", type: "text", getAttribute: () => null, ...props });

describe("which fields bring up the phone keyboard", () => {
  it("text boxes and text areas do", () => {
    expect(opensKeyboard(field())).toBe(true);
    expect(opensKeyboard(field({ type: "email" }))).toBe(true);
    expect(opensKeyboard(field({ type: "search" }))).toBe(true);
    expect(opensKeyboard({ tagName: "TEXTAREA", getAttribute: () => null })).toBe(true);
  });
  it("buttons, ticks, read-only and keypad-only fields do not", () => {
    expect(opensKeyboard(field({ type: "checkbox" }))).toBe(false);
    expect(opensKeyboard(field({ type: "submit" }))).toBe(false);
    expect(opensKeyboard(field({ readOnly: true }))).toBe(false);
    expect(opensKeyboard(field({ disabled: true }))).toBe(false);
    expect(opensKeyboard(field({ inputMode: "none" }))).toBe(false);
    expect(opensKeyboard({ tagName: "BUTTON", getAttribute: () => null })).toBe(false);
    expect(opensKeyboard(null)).toBe(false);
  });
});

describe("keyboard position", () => {
  const view = { height: 400, offsetTop: 0 };
  it("spots a field under the keyboard", () => {
    expect(hiddenByKeyboard({ top: 500, bottom: 540 }, view)).toBe(true);
    expect(hiddenByKeyboard({ top: 380, bottom: 420 }, view)).toBe(true);
    expect(hiddenByKeyboard({ top: 200, bottom: 240 }, view)).toBe(false);
  });
  it("counts the visible part of the page on iPhones (offsetTop)", () => {
    expect(hiddenByKeyboard({ top: 100, bottom: 140 }, { height: 400, offsetTop: 300 })).toBe(true);
    expect(hiddenByKeyboard({ top: 400, bottom: 440 }, { height: 400, offsetTop: 300 })).toBe(false);
  });
  it("tells the keyboard apart from the address bar sliding", () => {
    expect(keyboardIsOpen(420, 740)).toBe(true);
    expect(keyboardIsOpen(684, 740)).toBe(false);
  });
});

describe("installKeyboardHandling", () => {
  it("does nothing on computers without a touch screen", () => {
    const win = { document: {}, navigator: { maxTouchPoints: 0 }, matchMedia: () => ({ matches: false }) };
    expect(hasTouchScreen(win)).toBe(false);
    const stop = installKeyboardHandling(win);
    expect(typeof stop).toBe("function");
  });

  it("marks the page while typing with the keyboard up, then clears it", () => {
    vi.useFakeTimers();
    const listeners = {};
    const viewListeners = {};
    const input = field({ getBoundingClientRect: () => ({ top: 600, bottom: 640 }), scrollIntoView: vi.fn() });
    const root = { dataset: {} };
    const doc = {
      activeElement: null, documentElement: root,
      addEventListener: (type, fn) => { listeners[type] = fn; }, removeEventListener: vi.fn(),
    };
    const visualViewport = { height: 740, offsetTop: 0, addEventListener: (type, fn) => { viewListeners[type] = fn; }, removeEventListener: vi.fn() };
    const win = {
      document: doc, navigator: { maxTouchPoints: 5 }, visualViewport,
      matchMedia: () => ({ matches: false }), setTimeout, clearTimeout,
    };
    const stop = installKeyboardHandling(win);

    doc.activeElement = input;
    listeners.focusin({ target: input });
    visualViewport.height = 420; // keyboard slides up
    viewListeners.resize();
    expect(root.dataset.typing).toBe("true");
    expect(input.scrollIntoView).toHaveBeenCalledWith({ block: "center", inline: "nearest", behavior: "smooth" });

    visualViewport.height = 740; // keyboard closed with the back button, field still selected
    viewListeners.resize();
    expect(root.dataset.typing).toBeUndefined();

    visualViewport.height = 420;
    viewListeners.resize();
    expect(root.dataset.typing).toBe("true");
    doc.activeElement = null;
    listeners.focusout();
    vi.runAllTimers();
    expect(root.dataset.typing).toBeUndefined();
    stop();
    vi.useRealTimers();
  });
});
