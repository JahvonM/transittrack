def edit(path, pairs):
    s = open(path).read()
    for old, new in pairs:
        assert old in s, (path, old[:80])
        s = s.replace(old, new, 1)
    open(path, 'w').write(s)

P = 'base44/functions/nfcCards/entry.ts'
edit(P, [
    ("// Actions: people · issue · verify · revoke · add_holder",
     "// Actions: people · issue · verify · revoke · add_holder · keypad_code"),
    ("""      employee_id: c.employee_id || u.employee_id || '', company_id: c.company_id || '', company_name: c.company_name || '',
      assigned_vehicle: '', legacy_tag: c.nfc_card_tag || u.nfc_tag_id || '' });""",
     """      employee_id: c.employee_id || u.employee_id || '', company_id: c.company_id || '', company_name: c.company_name || '',
      assigned_vehicle: '', legacy_tag: c.nfc_card_tag || u.nfc_tag_id || '', access_code: c.access_code || u.access_code || '' });"""),
    ("""    people.push({ source: 'user', id: u.id, type: 'staff', role: 'Staff', name: u.full_name || u.email, email: u.email || '',
      employee_id: u.employee_id || '', company_id: u.company_id || '', company_name: '', assigned_vehicle: '', legacy_tag: u.nfc_tag_id || '' });""",
     """    people.push({ source: 'user', id: u.id, type: 'staff', role: 'Staff', name: u.full_name || u.email, email: u.email || '',
      employee_id: u.employee_id || '', company_id: u.company_id || '', company_name: '', assigned_vehicle: '', legacy_tag: u.nfc_tag_id || '',
      access_code: u.access_code || '' });"""),
    ("""      case 'add_holder': {""",
     """      // Keypad code for the bus boarding tablets (staff who forget their card).
      case 'keypad_code': {
        const { people } = await loadPeople(base44, companyFilter);
        const person = people.find((p) => p.key === body.person_key);
        if (!person) return Response.json({ error: 'Pick a person first.' }, { status: 404 });
        if (person.type !== 'staff') return Response.json({ error: 'Keypad codes are for bus staff.' }, { status: 400 });
        const [allContacts, allUsers] = await Promise.all([sr.Contact.list('-updated_date', 5000), sr.User.list()]);
        const taken = new Set([...allContacts, ...allUsers].map((r) => r.access_code).filter(Boolean));
        let code = '';
        for (let i = 0; i < 50 && (!code || taken.has(code)); i++) code = String(Math.floor(10000 + Math.random() * 90000));
        if (person.source === 'user') await sr.User.update(person.id, { access_code: code });
        else await sr.Contact.update(person.id, { access_code: code });
        await audit(base44, user, { action: 'update', entity: person.source === 'user' ? 'User' : 'Contact', record_id: person.id, summary: `New keypad code for ${person.name}` });
        return Response.json({ ok: true, code });
      }

      case 'add_holder': {"""),
])

P = 'src/components/admin/CardIssuingTab.jsx'
edit(P, [
    ("""  const [manualUid, setManualUid] = useState("");""",
     """  const [manualUid, setManualUid] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);"""),
    ("""  const program = () => {""",
     """  const giveKeypadCode = async () => {
    if (!selected || codeBusy) return;
    if (selected.access_code && !(await confirmAction({ title: `Give ${selected.name} a new keypad code?`, description: `Their current code ${selected.access_code} will stop working.`, confirmLabel: "New code" }))) return;
    setCodeBusy(true);
    try {
      const res = await base44.functions.invoke("nfcCards", { action: "keypad_code", person_key: selected.key });
      addLog(`Keypad code for ${selected.name}: ${res.data?.code}`, "ok");
      toast({ title: `Keypad code for ${selected.name}: ${res.data?.code}`, description: "They type it on the bus boarding tablet's keypad." });
      await load();
    } catch (e) {
      toast({ title: "Couldn't make a code", description: e?.response?.data?.error || e.message, variant: "destructive" });
    } finally { setCodeBusy(false); }
  };

  const program = () => {"""),
    ("""                      <div><dt className="text-xs text-muted-foreground">Current card</dt>""",
     """                      {selected?.type === "staff" && (
                        <div className="sm:col-span-2 flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2">
                          <div className="flex-1">
                            <dt className="text-xs text-muted-foreground">Keypad code (if they forget their card)</dt>
                            <dd className="text-lg font-bold tracking-[0.25em]">{selected.access_code || "—"}</dd>
                          </div>
                          <Button type="button" variant="outline" size="sm" onClick={giveKeypadCode} disabled={codeBusy}>
                            {codeBusy ? "…" : selected.access_code ? "New code" : "Give code"}
                          </Button>
                        </div>
                      )}
                      <div><dt className="text-xs text-muted-foreground">Current card</dt>"""),
])
print("ok")
