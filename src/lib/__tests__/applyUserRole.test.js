import { describe, it, expect } from "vitest";
import { load, mock, request } from "../../../security-tests/helpers.js";

// Registration: the role picked on the sign-up screen is saved once.
const pick = async (sdk, role) => { const r = await load("applyUserRole", sdk).default(request({ role })); return { status: r.status, body: await r.json() }; };
const me = (sdk) => sdk.tables.User.find((u) => u.id === "caller");

describe("choosing a role when registering", () => {
  it("saves the role a brand-new account picked (platform default role 'user')", async () => {
    for (const role of ["staff", "driver"]) {
      const sdk = mock("user");
      expect(me(sdk).role).toBe("user");
      expect((await pick(sdk, role)).status).toBe(200);
      expect(me(sdk).role).toBe(role);
    }
  });

  it("works for an account with no role yet", async () => {
    const sdk = mock("user");
    delete me(sdk).role;
    expect((await pick(sdk, "driver")).status).toBe(200);
    expect(me(sdk).role).toBe("driver");
  });

  it("never lets anyone pick admin or company, or change a role already set", async () => {
    const fresh = mock("user");
    for (const role of ["admin", "company", "mechanic"]) expect((await pick(fresh, role)).status).toBe(400);
    expect(me(fresh).role).toBe("user");
    for (const current of ["staff", "driver", "company", "mechanic"]) {
      const sdk = mock(current);
      expect((await pick(sdk, current === "driver" ? "staff" : "driver")).status).toBe(403);
      expect(me(sdk).role).toBe(current);
    }
  });
});
