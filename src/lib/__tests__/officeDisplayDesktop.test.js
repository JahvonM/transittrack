import { describe, expect, it } from "vitest";
import { renewOpenDisplays } from "../officeDisplayDesktop";

// The desktop app's display windows: renewal keeps working ones open and
// closes the ones the server no longer serves; a network blip closes nothing.
function bridge(ids) {
  const closed = [];
  return { closed, list: async () => ids.map((id) => ({ id })), close: async (id) => { closed.push(id); } };
}

describe("renewing display windows", () => {
  it("closes only windows whose access is gone", async () => {
    const b = bridge(["ok", "gone", "offline", "deleted"]);
    const asked = [];
    await renewOpenDisplays(b, async (action, body) => {
      asked.push([action, body.display_id]);
      if (body.display_id === "gone") throw Object.assign(new Error("Open the display again"), { status: 409 });
      if (body.display_id === "deleted") throw Object.assign(new Error("missing"), { response: { status: 404 } });
      if (body.display_id === "offline") throw new Error("No connection");
      return { data: { ok: true } };
    });
    expect(asked.map((a) => a[0])).toEqual(["window_renew", "window_renew", "window_renew", "window_renew"]);
    expect(b.closed).toEqual(["gone", "deleted"]);
  });
  it("copes with the bridge failing", async () => {
    await expect(renewOpenDisplays({ list: async () => { throw new Error("gone"); }, close: async () => {} }, async () => ({}))).resolves.toBeUndefined();
  });
});
