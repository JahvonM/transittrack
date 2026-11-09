import { describe, it, expect } from "vitest";
import { liveViewStatus, tabletCanStream } from "@/lib/liveViewStatus";

// Admin → Fleet workspace: what a bus's camera box says before video plays.

const tablet = { paired: true, helper_health: { support_available: true, support_transport: "webrtc" } };

describe("which tablets can send live video", () => {
  it("needs a paired tablet whose app offers direct viewing", () => {
    expect(tabletCanStream(tablet)).toBe(true);
    expect(tabletCanStream({ ...tablet, paired: false })).toBe(false);
    expect(tabletCanStream({ ...tablet, helper_health: { support_available: false, support_transport: "webrtc" } })).toBe(false);
    expect(tabletCanStream({ ...tablet, helper_health: { support_available: true, support_transport: "relay" } })).toBe(false);
    expect(tabletCanStream(null)).toBe(false);
  });
});

describe("the camera box's status line", () => {
  it("says why video can't start before asking the tablet", () => {
    expect(liveViewStatus({ enabled: null, device: tablet })).toMatch(/Checking/);
    expect(liveViewStatus({ enabled: false, device: tablet })).toMatch(/isn't switched on/);
    expect(liveViewStatus({ enabled: true, device: { ...tablet, helper_health: { support_available: true } } })).toMatch(/direct-viewing update/);
    expect(liveViewStatus({ enabled: true, device: { ...tablet, paired: false } })).toMatch(/can't send video/);
  });

  it("follows the session from asking to connecting", () => {
    expect(liveViewStatus({ enabled: true, device: tablet, busy: true })).toBe("Asking the tablet…");
    expect(liveViewStatus({ enabled: true, device: tablet })).toMatch(/Choose Back camera or Front camera/);
    expect(liveViewStatus({ enabled: true, device: tablet, session: { state: "requested" } })).toMatch(/check in/);
    expect(liveViewStatus({ enabled: true, device: tablet, session: { state: "waiting_permission" } })).toBe("Waiting for the tablet…");
    expect(liveViewStatus({ enabled: true, device: tablet, session: { state: "connecting" } })).toBe("Connecting video…");
    expect(liveViewStatus({ enabled: true, device: tablet, session: { state: "active" } })).toBe("Connecting video…");
  });

  it("explains a failure, a refusal and the end of a view", () => {
    expect(liveViewStatus({ enabled: true, device: tablet, session: { state: "failed", failure_code: "CAPTURE_TIMEOUT" } })).toMatch(/Camera or screen startup timed out/);
    expect(liveViewStatus({ enabled: true, device: tablet, session: { state: "failed", failure_code: "nonsense" } })).toMatch(/couldn't start the video/);
    expect(liveViewStatus({ enabled: true, device: tablet, session: { state: "denied" } })).toMatch(/didn't allow/);
    expect(liveViewStatus({ enabled: true, device: tablet, session: { state: "expired" } })).toMatch(/ended/);
    expect(liveViewStatus({ enabled: true, device: tablet, session: { state: "ended" } })).toMatch(/watch again/);
  });
});
