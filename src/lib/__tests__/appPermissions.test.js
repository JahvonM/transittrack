import { describe, it, expect } from "vitest";
import { APP_PERMISSIONS, NOTIFICATIONS_ALLOWED_EVENT, permissionStatus, requestAllPermissions, requestPermission } from "../appPermissions.js";

function fakeWindow({ notification = "default", answer = "granted", geo = "allow", media = "allow", query = {} } = {}) {
  const events = [];
  const asked = [];
  const stopped = [];
  const win = {
    dispatchEvent: (e) => events.push(e.type),
    navigator: {
      permissions: { query: async ({ name }) => { if (!(name in query)) throw new TypeError("unknown"); return { state: query[name] }; } },
      geolocation: geo && {
        getCurrentPosition: (ok, fail) => {
          asked.push("location");
          if (geo === "allow") ok({ coords: { latitude: 12.05, longitude: -61.75 } });
          else if (geo === "deny") fail({ code: 1 });
          else fail({ code: 3 }); // allowed, but no fix in time
        },
      },
      mediaDevices: media && {
        getUserMedia: async (constraints) => {
          asked.push(JSON.stringify(constraints));
          if (media === "deny") throw Object.assign(new Error("no"), { name: "NotAllowedError" });
          if (media === "none") throw Object.assign(new Error("none"), { name: "NotFoundError" });
          if (media === "mic-only" && constraints.video) throw Object.assign(new Error("none"), { name: "NotFoundError" });
          return { getTracks: () => [{ stop: () => stopped.push(constraints) }] };
        },
      },
    },
  };
  if (notification) {
    win.Notification = { permission: notification, requestPermission: async () => { asked.push("notifications"); win.Notification.permission = answer; return answer; } };
  }
  return { win, events, asked, stopped };
}

describe("app permissions", () => {
  it("lists notifications, location, and camera with microphone", () => {
    expect(APP_PERMISSIONS.map((p) => p.id)).toEqual(["notifications", "location", "media"]);
  });

  it("reads what has been decided, and what this browser can't do", async () => {
    const { win } = fakeWindow({ notification: "denied", query: { geolocation: "granted", camera: "granted", microphone: "granted" } });
    expect(await permissionStatus("notifications", win)).toBe("denied");
    expect(await permissionStatus("location", win)).toBe("granted");
    expect(await permissionStatus("media", win)).toBe("granted");
    // Safari on an iPhone (not on the Home Screen) has no notifications at all.
    const safari = fakeWindow({ notification: null, geo: null, media: null }).win;
    expect(await permissionStatus("notifications", safari)).toBe("unsupported");
    expect(await permissionStatus("location", safari)).toBe("unsupported");
    expect(await permissionStatus("media", safari)).toBe("unsupported");
    // A browser that can't say yet counts as not decided.
    expect(await permissionStatus("media", fakeWindow().win)).toBe("prompt");
  });

  it("asks for all of them, notifications first, and stops the camera straight away", async () => {
    const { win, asked, stopped, events } = fakeWindow();
    const seen = [];
    const result = await requestAllPermissions({}, (id, state) => seen.push(`${id}:${state}`), win);
    expect(result).toEqual({ notifications: "granted", location: "granted", media: "granted" });
    expect(asked[0]).toBe("notifications");
    expect(asked).toContain(JSON.stringify({ video: true, audio: true }));
    expect(stopped).toHaveLength(1);
    expect(events).toContain(NOTIFICATIONS_ALLOWED_EVENT);
    expect(seen).toEqual(["notifications:asking", "notifications:granted", "location:asking", "location:granted", "media:asking", "media:granted"]);
  });

  it("doesn't ask again for what was already decided", async () => {
    const { win, asked } = fakeWindow();
    await requestAllPermissions({ notifications: "denied", location: "granted", media: "prompt" }, () => {}, win);
    expect(asked).toEqual([JSON.stringify({ video: true, audio: true })]);
  });

  it("reports a refusal as blocked", async () => {
    const { win } = fakeWindow({ answer: "denied", geo: "deny", media: "deny" });
    expect(await requestPermission("notifications", win)).toBe("denied");
    expect(await requestPermission("location", win)).toBe("denied");
    expect(await requestPermission("media", win)).toBe("denied");
  });

  it("counts location as allowed when there's just no fix yet", async () => {
    expect(await requestPermission("location", fakeWindow({ geo: "slow" }).win)).toBe("granted");
  });

  it("asks for the microphone alone on a device with no camera, and says when there's neither", async () => {
    const micOnly = fakeWindow({ media: "mic-only" });
    expect(await requestPermission("media", micOnly.win)).toBe("granted");
    expect(micOnly.asked).toEqual([JSON.stringify({ video: true, audio: true }), JSON.stringify({ audio: true })]);
    expect(await requestPermission("media", fakeWindow({ media: "none" }).win)).toBe("unsupported");
  });

  it("works with older Safari, which answers notifications through a callback", async () => {
    const { win } = fakeWindow();
    win.Notification.requestPermission = (callback) => { setTimeout(() => callback("granted"), 0); return undefined; };
    expect(await requestPermission("notifications", win)).toBe("granted");
  });
});
