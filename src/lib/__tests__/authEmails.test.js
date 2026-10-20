import { describe, it, expect } from "vitest";
import {
  buildEmails, checkEmails, expiresText, mergeAllowList, planAuthConfig, push, reportUrl, CODE_LENGTH,
} from "../../../tools/supabase/auth-emails.mjs";

// The sign-in emails Supabase sends for the app (tools/supabase/auth-emails.mjs)
// and the step that puts them on the project.

const KINDS = ["confirmation", "recovery", "invite"];
const blankConfig = () => ({
  site_url: "https://app.mcsweenstransport.com",
  uri_allow_list: "https://new.mcsweenstransport.com/\\*\\*",
  mailer_otp_length: 8,
  mailer_otp_exp: 3600,
  smtp_host: null,
  ...Object.fromEntries(KINDS.flatMap((k) => [[`mailer_subjects_${k}`, null], [`mailer_templates_${k}_content`, null]])),
});

describe("sign-in emails", () => {
  it("build cleanly, and the links can't be spent by a mail scanner", () => {
    const emails = buildEmails();
    expect(checkEmails(emails)).toEqual([]);
    expect(emails.confirmation.html).toContain("{{ .Token }}");
    expect(emails.recovery.html).toContain("{{ .RedirectTo }}/reset-password?token={{ .TokenHash }}&amp;type=recovery");
    expect(emails.invite.html).toContain("{{ .RedirectTo }}/reset-password?token={{ .TokenHash }}&amp;type=invite");
    for (const k of KINDS) {
      expect(emails[k].html).not.toContain("ConfirmationURL");
      expect(emails[k].subject).toContain("McSween Transport");
    }
    expect(checkEmails({ ...emails, recovery: { ...emails.recovery, html: "<a href=\"{{ .ConfirmationURL }}\">x</a>" } }).length).toBeGreaterThan(0);
    expect(checkEmails({ ...emails, invite: { subject: "x", html: emails.invite.html.replace("{{ .TokenHash }}", "{{ .Oops }}") } }).length).toBeGreaterThan(0);
  });

  it("say how long the code lasts", () => {
    expect(expiresText(3600)).toBe("in 1 hour");
    expect(expiresText(86400)).toBe("in 24 hours");
    expect(expiresText(900)).toBe("in 15 minutes");
    expect(expiresText(undefined)).toBe("in 1 hour");
  });

  it("keep both sites on the redirect list without dropping anything", () => {
    const merged = mergeAllowList("https://new.mcsweenstransport.com/\\*\\*, http://localhost:5173/**");
    const list = merged.split(",");
    expect(list).toContain("http://localhost:5173/**");
    expect(list).toContain("https://new.mcsweenstransport.com/**");
    expect(list).toContain("https://new.mcsweenstransport.com");
    expect(list).toContain("https://app.mcsweenstransport.com");
    expect(list.filter((s) => s === "https://new.mcsweenstransport.com/**")).toHaveLength(1);
    expect(merged).not.toContain("\\");
    expect(mergeAllowList(merged)).toBe(merged);
  });

  it("change only what is different, and Resend only when its key is there", () => {
    const emails = buildEmails();
    const first = planAuthConfig(blankConfig(), { emails });
    expect(first.mailer_otp_length).toBe(CODE_LENGTH);
    expect(first.mailer_templates_recovery_content).toBe(emails.recovery.html);
    expect(first.smtp_host).toBeUndefined();
    expect(planAuthConfig({ ...blankConfig(), ...first }, { emails })).toEqual({});
    const withResend = planAuthConfig({ ...blankConfig(), ...first }, { emails, smtp: { key: "re_test" } });
    expect(withResend).toMatchObject({ smtp_host: "smtp.resend.com", smtp_user: "resend", smtp_pass: "re_test", smtp_admin_email: "no-reply@mcsweenstransport.com", smtp_sender_name: "McSween Transport" });
    // Settings Supabase leaves out count as empty, so they get filled in.
    expect(planAuthConfig({}, { emails }).mailer_templates_invite_content).toBe(emails.invite.html);
  });

  it("put them on the project and never print a secret", async () => {
    let config = blankConfig();
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, method: init.method, auth: init.headers.Authorization, body: init.body ? JSON.parse(init.body) : null });
      if (init.method === "PATCH") config = { ...config, ...JSON.parse(init.body), smtp_pass: undefined };
      if (init.method === "POST") return new Response("", { status: 201 });
      return new Response(JSON.stringify(config), { status: 200 });
    };
    const lines = [];
    const log = (line) => lines.push(line);
    const token = "sbp_secrettoken0000000000";
    const resendKey = "re_secretkey000000";
    const result = await push({ ref: "ghqpznxqngvhmkiwcauj", token, resendKey, fetchImpl, log });
    expect(result.changed).toContain("mailer_templates_recovery_content");
    expect(calls.map((c) => c.method)).toEqual(["GET", "PATCH", "POST", "GET"]);
    expect(calls[0].url).toBe("https://api.supabase.com/v1/projects/ghqpznxqngvhmkiwcauj/config/auth");
    expect(calls.every((c) => c.auth === `Bearer ${token}`)).toBe(true);
    expect(calls[2].body).toEqual([{ name: "RESEND_API_KEY", value: resendKey }]);
    const printed = lines.join("\n");
    expect(printed).not.toContain(token);
    expect(printed).not.toContain(resendKey);
    expect(printed).toContain("https://new.mcsweenstransport.com/**");

    // A second run with nothing to change only reads.
    calls.length = 0;
    await push({ ref: "ghqpznxqngvhmkiwcauj", token, fetchImpl, log });
    expect(calls.map((c) => c.method)).toEqual(["GET", "GET"]);

    // Errors from Supabase are shown without the secrets in them.
    const failing = async () => new Response(`bad token ${token}`, { status: 401 });
    const error = await push({ ref: "ghqpznxqngvhmkiwcauj", token, fetchImpl: failing, log }).catch((e) => e);
    expect(error.message).toContain("401");
    expect(error.message).not.toContain(token);
    await expect(push({ ref: "../x", token, fetchImpl, log })).rejects.toThrow(/project ref/);
  });

  it("leave a note of how the run went in the project's API logs", () => {
    const url = new URL(reportUrl("ghqpznxqngvhmkiwcauj", { result: "failed", error: "x".repeat(900) }));
    expect(url.origin).toBe("https://ghqpznxqngvhmkiwcauj.supabase.co");
    expect(url.pathname).toBe("/auth/v1/health");
    expect(url.searchParams.get("tt_ci")).toBe("auth-emails");
    expect(url.searchParams.get("result")).toBe("failed");
    expect(url.searchParams.get("error")).toHaveLength(400);
  });
});
