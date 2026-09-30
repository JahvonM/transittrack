p = 'src/components/directory/ContactFormDialog.jsx'
s = open(p).read()
def rep(old, new):
    global s
    assert old in s, old[:80]
    s = s.replace(old, new, 1)

rep('import { useNfcTap } from "@/hooks/useNfcTap";\n', 'import { useAuth } from "@/lib/AuthContext";\nimport { formatUid } from "@/lib/cardReader";\n')
rep('''  const [form, setForm] = useState(empty);
  const [nfcListening, setNfcListening] = useState(false);
  const [nfcBusy, setNfcBusy] = useState(false);
  const [nfcError, setNfcError] = useState("");
  const [nfcSuccess, setNfcSuccess] = useState("");
  const [codeBusy''', '''  const [form, setForm] = useState(empty);
  const { user } = useAuth();
  const [codeBusy''')
rep('''      setForm({ ...empty, ...(contact || {}) });
      setNfcListening(false);
      setNfcError("");
      setNfcSuccess("");
      setCodeError("");''', '''      setForm({ ...empty, ...(contact || {}) });
      setCodeError("");''')
rep('''    onSave(form);
  };''', '''    // Cards are issued (and replaced / revoked) only in Admin > Card issuing,
    // so saving this form never touches the card on file.
    const { nfc_card_tag: _card, ...rest } = form;
    onSave(rest);
  };''')
i = s.index('  // Tapping a badge here writes straight through kioskCheckIn')
j = s.index('  const generateAccessCode = async () => {')
s = s[:i] + s[j:]

i = s.index('              <div className="space-y-1.5">\n                <Label className="text-xs text-muted-foreground">NFC card tag</Label>')
j = s.index('              <div className="space-y-1.5">\n                <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">\n                  <Hash')
s = s[:i] + '''              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">NFC card</Label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 font-mono text-sm">{form.nfc_card_tag ? formatUid(form.nfc_card_tag) : "No card issued"}</div>
                  {user?.role === "admin" && (
                    <Button type="button" variant="outline" size="sm" asChild>
                      <a href="/admin/cards">{form.nfc_card_tag ? "Change card" : "Issue card"}</a>
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Cards are issued, replaced and revoked in Admin → Card issuing{user?.role === "admin" ? "" : " by an administrator"}.
                </p>
              </div>
''' + s[j:]

i = s.index('''          ) : (
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Nfc className="w-3.5 h-3.5" /> NFC card tag''')
j = s.index('''          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <MapPin''')
s = s[:i] + '''          ) : form.type === "staff" ? (
            <p className="text-xs text-muted-foreground">
              Save this contact first. Then issue their card in Admin → Card issuing, or edit them here to give a keypad code.
            </p>
          ) : null}

''' + s[j:]
rep('<Nfc className="w-4 h-4 text-primary" /> Badge & access code', '<Nfc className="w-4 h-4 text-primary" /> Card & keypad code')
open(p, 'w').write(s)
print('ok')
