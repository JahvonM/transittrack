f = "src/pages/CompanyDashboard.jsx"
s = open(f).read()
start = s.index("function VehiclesTab({ company, routes, vehicles, onChange }) {")
end = s.index("  const remove = async (id) => {", start)
s = s[:start] + '''function VehiclesTab({ company, routes, vehicles, onChange }) {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);

''' + s[end:]
# list header with add button + edit + 3D thumbnail
s = s.replace('''      <div className="space-y-2">
        {vehicles.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">No vehicles yet. Add your first bus or taxi.</p>}''', '''      <div className="space-y-2">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="w-4 h-4" /> Add vehicle</Button>
        </div>
        {vehicles.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">No vehicles yet. Add your first bus or taxi.</p>}''', 1)
s = s.replace('''            <div className="w-10 h-10 rounded-lg bg-primary/10 grid place-items-center shrink-0">
              {v.type === "taxi" ? <Car className="w-5 h-5" /> : <Bus className="w-5 h-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{v.name} <span className="text-xs text-muted-foreground font-normal">· {v.plate_number}</span></div>''', '''            <div className="rounded-xl bg-muted/50 shrink-0"><VehicleModelThumb model={modelIdFor(v)} size={48} /></div>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{v.name} <span className="text-xs text-muted-foreground font-normal">· {[v.fleet_number, v.plate_number].filter(Boolean).join(" · ")}</span></div>''', 1)
s = s.replace('''            <Button variant="ghost" size="icon" onClick={() => remove(v.id)}>
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>''', '''            <Button variant="ghost" size="icon" onClick={() => { setEditing(v); setFormOpen(true); }} aria-label="Edit">
              <Pencil className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => remove(v.id)}>
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        ))}
        <VehicleFormDialog open={formOpen} onOpenChange={setFormOpen} vehicle={editing} fixedCompany={company} routes={routes} onSaved={onChange} />
      </div>''', 1)
s = s.replace("Live vehicle positions with your route stop paths. Add vehicles from the Admin dashboard.", "Live vehicle positions with your route stop paths.")
imports = 'import VehicleFormDialog from "@/components/VehicleFormDialog";\nimport { VehicleModelThumb } from "@/components/VehicleModelPicker";\nimport { modelIdFor } from "@/lib/vehicleModels";\n'
lines = s.split("\n")
last = max(i for i, l in enumerate(lines) if l.startswith("import "))
while not lines[last].rstrip().endswith(";"):
    last += 1
lines.insert(last + 1, imports.rstrip("\n"))
s = "\n".join(lines)
open(f, "w").write(s)
print("ok", s.count("VehicleFormDialog"), s.count("VehicleModelThumb"))
