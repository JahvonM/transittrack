import re

HELPER = '''
// These jobs can be reached over plain HTTP with no login (that's how the
// scheduler calls them), so outside an admin each one may only run once per
// period; otherwise anyone could spam admin inboxes by hitting the URL.
async function claimRun(base44, job, minGapMs, isAdmin) {
  const db = base44.asServiceRole.entities.JobRun;
  const last = (await db.filter({ job }, '-ran_at', 1))[0];
  if (!isAdmin && last && Date.now() - new Date(last.ran_at).getTime() < minGapMs) return false;
  await db.create({ job, ran_at: new Date().toISOString(), trigger: isAdmin ? 'admin' : 'schedule' });
  return true;
}
'''

JOBS = {
    "weeklyReport": ("6 * 24 * 60 * 60 * 1000", "currentUser.role !== 'admin'"),
    "maintenanceAlerts": ("20 * 60 * 60 * 1000", None),
    "inspectionAlerts": ("20 * 60 * 60 * 1000", None),
}

for job, (gap, _) in JOBS.items():
    f = f"base44/functions/{job}/entry.ts"
    s = open(f).read()
    if "claimRun" in s:
        print("skip", job); continue
    # insert helper after the first import line
    first_nl = s.index("\n") + 1
    s = s[:first_nl] + HELPER + s[first_nl:]
    # capture admin-ness inside the existing guard
    m = re.search(r"try \{\n(\s*)const currentUser = await base44\.auth\.me\(\);\n", s)
    assert m, job
    ind = m.group(1)
    s = s.replace(m.group(0), "let isAdmin = false;\n" + ind[:-2] + "try {\n" + ind + "const currentUser = await base44.auth.me();\n" + ind + "isAdmin = currentUser?.role === 'admin';\n", 1)
    # after the guard's catch line, claim the run
    m2 = re.search(r"\} catch \{ /\* scheduled run, no user — proceed \*/ \}\n", s)
    assert m2, job
    ind2 = ind[:-2]
    claim = (f"{ind2}if (!(await claimRun(base44, '{job}', {gap}, isAdmin))) {{\n"
             f"{ind2}  return Response.json({{ ok: true, skipped: 'already ran recently' }});\n{ind2}}}\n")
    s = s[:m2.end()] + claim + s[m2.end():]
    open(f, "w").write(s)
    print("patched", job)
