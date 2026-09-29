f = "src/components/admin/DriversTab.jsx"
s = open(f).read()

def sub(old, new):
    global s
    assert old in s, old[:80]
    s = s.replace(old, new, 1)

sub('import { useToast } from "@/components/ui/use-toast";',
    'import { useToast } from "@/components/ui/use-toast";\nimport DriverDocumentsDialog, { DocChips } from "@/components/admin/DriverDocuments";')
sub("function DriverCard({ driver, vehicles, companies, routes, onAssign, onUnassign, onSetStatus, onSetRoute, onSetPin, onSaved, onRemove }) {\n  const [editOpen, setEditOpen] = useState(false);",
    "function DriverCard({ driver, vehicles, companies, routes, docs = [], onDocsChanged, onAssign, onUnassign, onSetStatus, onSetRoute, onSetPin, onSaved, onRemove }) {\n  const [editOpen, setEditOpen] = useState(false);\n  const [docsOpen, setDocsOpen] = useState(false);")
sub('''      </CardContent>

      <EditDriverDialog driver={driver} companies={companies} open={editOpen} onOpenChange={setEditOpen} onSaved={onSaved} />''',
    '''        <DocChips docs={docs} onOpen={() => setDocsOpen(true)} />
      </CardContent>

      <EditDriverDialog driver={driver} companies={companies} open={editOpen} onOpenChange={setEditOpen} onSaved={onSaved} />
      <DriverDocumentsDialog driver={driver} docs={docs} open={docsOpen} onOpenChange={setDocsOpen} onChanged={onDocsChanged} />''')
sub('''export default function DriversTab({ drivers, vehicles, companies, routes, onChange }) {
  const { toast } = useToast();
''', '''export default function DriversTab({ drivers, vehicles, companies, routes, onChange }) {
  const { toast } = useToast();
  const [docs, setDocs] = useState([]);
  const loadDocs = () => base44.entities.DriverDocument.list("-updated_date", 1000).then(setDocs).catch(() => {});
  useEffect(() => { loadDocs(); }, []);
''')
sub('''            onSaved={onChange}
            onRemove={removeDriver}''', '''            onSaved={onChange}
            onRemove={removeDriver}
            docs={docs.filter((doc) => doc.driver_id === d.id)}
            onDocsChanged={loadDocs}''')
open(f, "w").write(s)
print("ok")
