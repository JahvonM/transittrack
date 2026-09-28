import re, sys

IMPORT = 'import { loadFailed } from "@/lib/loadFailed";\n'
CATCH = '.catch(() => { setLoading(false); loadFailed(); })'

def wrap_async(src, header, fn_name, end_old):
    """Wrap an async loader body in try/catch/finally. header is the opening line, end_old the trailing setLoading(false) + close."""
    i = src.index(header)
    j = src.index(end_old, i)
    body = src[i + len(header):j]
    ind = re.match(r"\n?( *)", body).group(1) if body.strip() else "    "
    body = "\n".join(("  " + l if l.strip() else l) for l in body.split("\n"))
    close_ind = ind[:-2]
    new = (header + ind + "try {" + body + "\n" + ind + "} catch {\n" + ind + "  loadFailed(" + fn_name + ");\n"
           + ind + "} finally {\n" + ind + "  setLoading(false);\n" + ind + "}\n" + close_ind + "};")
    return src[:i] + new + src[j + len(end_old):]

def add_import(src):
    if "@/lib/loadFailed" in src:
        return src
    lines = src.split("\n")
    last = max(i for i, l in enumerate(lines) if l.startswith("import "))
    # handle multi-line imports: advance to line ending with ;
    while not lines[last].rstrip().endswith(";"):
        last += 1
    lines.insert(last + 1, IMPORT.rstrip("\n"))
    return "\n".join(lines)

def rep(src, old, new, f):
    if old not in src:
        print("MISSING in", f, ":", old[:80]); sys.exit(1)
    return src.replace(old, new, 1)

files = {}
def get(f):
    if f not in files:
        files[f] = open(f).read()
    return files[f]
def put(f, s):
    files[f] = s

# --- async loaders ---
async_jobs = [
    ("src/components/admin/AdsTab.jsx", "  const load = async () => {\n", "load", "\n    setLoading(false);\n  };"),
    ("src/components/mechanic/MechanicDashboardTab.jsx", "  const load = async () => {\n", "load", "\n    setLoading(false);\n  };"),
    ("src/pages/IncidentReports.jsx", "  const load = async () => {\n", "load", "\n    setItems(all); setLoading(false);\n  };"),
    ("src/pages/PassengerBookings.jsx", "  const load = async () => {\n", "load", "\n    setTrips(t); setVehicles(v); setLoading(false);\n  };"),
    ("src/pages/VehicleDetail.jsx", "  const load = async () => {\n", "load", "\n    setLoading(false);\n  };"),
    ("src/pages/Admin.jsx", "  const load = async () => {\n    const [u, c, v, r, t, insp", "load", "\n    setLoading(false);\n  };"),
    ("src/pages/CompanyDashboard.jsx", "  const loadAll = async () => {\n", "loadAll", "\n    setLoading(false);\n  };"),
    ("src/pages/ManagerDashboard.jsx", "    const load = async () => {\n", "load", "\n      setLoading(false);\n    };"),
]
for f, header, fn, end in async_jobs:
    s = get(f)
    # keep non-loading statements that shared the final line
    if end.startswith("\n    setItems(all);"):
        s = rep(s, "    setItems(all); setLoading(false);\n  };", "    setItems(all);\n    setLoading(false);\n  };", f)
        end = "\n    setLoading(false);\n  };"
    if end.startswith("\n    setTrips(t); setVehicles(v);"):
        s = rep(s, "    setTrips(t); setVehicles(v); setLoading(false);\n  };", "    setTrips(t); setVehicles(v);\n    setLoading(false);\n  };", f)
        end = "\n    setLoading(false);\n  };"
    if header.startswith("  const load = async () => {\n    const [u"):
        real_header = "  const load = async () => {\n"
        i = s.index(header)
        s2 = s[:i] + s[i:]
        s = wrap_async(s2, real_header, fn, end) if s2.index(real_header) == i else None
    else:
        s = wrap_async(s, header, fn, end)
    put(f, s)

# --- .then chains without catch ---
then_jobs = [
    ("src/components/MechanicSettingsDialog.jsx",
     "        setEnablePhotos(s.enable_photo_attachments !== false);\n      }\n      setLoading(false);\n    });",
     "        setEnablePhotos(s.enable_photo_attachments !== false);\n      }\n      setLoading(false);\n    })" + CATCH + ";"),
    ("src/pages/RouteExplorer.jsx",
     "      setRoutes(r.filter((x) => x.active)); setVehicles(v); setLoading(false);\n    });",
     "      setRoutes(r.filter((x) => x.active)); setVehicles(v); setLoading(false);\n    })" + CATCH + ";"),
    ("src/pages/StaffPortal.jsx",
     "      statusRef.current = Object.fromEntries(t.map((x) => [x.id, x.status]));\n      setLoading(false);\n    });",
     "      statusRef.current = Object.fromEntries(t.map((x) => [x.id, x.status]));\n      setLoading(false);\n    })" + CATCH + ";"),
    ("src/pages/ServiceHistory.jsx",
     "      setVehicles(v); setInspections(i); setLoading(false);\n    });",
     "      setVehicles(v); setInspections(i); setLoading(false);\n    })" + CATCH + ";"),
    ("src/pages/RunInspection.jsx",
     "      setPhotosEnabled(settingsList[0]?.enable_photo_attachments !== false);\n      setLoading(false);\n    });",
     "      setPhotosEnabled(settingsList[0]?.enable_photo_attachments !== false);\n      setLoading(false);\n    })" + CATCH + ";"),
    ("src/pages/StaffDirectory.jsx",
     "      setContacts(c);\n      setLoading(false);\n    });",
     "      setContacts(c);\n      setLoading(false);\n    })" + CATCH + ";"),
    ("src/pages/RouteAnalytics.jsx",
     "      setRoutes(r); setTrips(t); setLoading(false);\n    });",
     "      setRoutes(r); setTrips(t); setLoading(false);\n    })" + CATCH + ";"),
    ("src/pages/MechanicPortal.jsx",
     "base44.entities.Vehicle.list().then((v) => { setVehicles(v); setLoading(false); });",
     "base44.entities.Vehicle.list().then((v) => { setVehicles(v); setLoading(false); })" + CATCH + ";"),
    ("src/pages/VehicleLogs.jsx",
     "      setVehicles(v.sort((a, b) => new Date(b.last_location_update || 0) - new Date(a.last_location_update || 0)));\n      setLoading(false);\n    });",
     "      setVehicles(v.sort((a, b) => new Date(b.last_location_update || 0) - new Date(a.last_location_update || 0)));\n      setLoading(false);\n    })" + CATCH + ";"),
]
for f, old, new in then_jobs:
    put(f, rep(get(f), old, new, f))

for f, s in files.items():
    s = add_import(s)
    open(f, "w").write(s)
    print("patched", f)
