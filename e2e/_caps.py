jobs = [
    ("src/components/mechanic/MechanicDashboardTab.jsx", "entities.Fault.list()", 'entities.Fault.list("-created_date", 1000)'),
    ("src/pages/StaffPortal.jsx", "entities.Trip.filter({ company_id: company.id })", 'entities.Trip.filter({ company_id: company.id }, "-scheduled_time", 500)'),
    ("src/pages/Welcome.jsx", "entities.Trip.filter({ driver_email: user.email })", 'entities.Trip.filter({ driver_email: user.email }, "-scheduled_time", 200)'),
    ("src/pages/VehicleDetail.jsx", "entities.Fault.filter({ vehicle_id: id })", 'entities.Fault.filter({ vehicle_id: id }, "-created_date", 500)'),
    ("src/pages/ManagerDashboard.jsx", "entities.Trip.list()", 'entities.Trip.list("-created_date", 1000)'),
    ("src/pages/Admin.jsx", "entities.Trip.list()", 'entities.Trip.list("-created_date", 1000)'),
    ("src/pages/Admin.jsx", "entities.Inspection.list()", 'entities.Inspection.list("-created_date", 1000)'),
    ("src/pages/Admin.jsx", "entities.Fault.list()", 'entities.Fault.list("-created_date", 1000)'),
    ("src/pages/CompanyDashboard.jsx", "entities.Trip.list()", 'entities.Trip.list("-created_date", 1000)'),
    ("src/pages/DriverSchedule.jsx", "entities.Trip.filter({ driver_email: user.email })", 'entities.Trip.filter({ driver_email: user.email }, "-scheduled_time", 200)'),
]
for f, old, new in jobs:
    s = open(f).read()
    n = s.count(old)
    if n == 0:
        raise SystemExit(f"MISSING {f}: {old}")
    s = s.replace(old, new)
    open(f, "w").write(s)
    print(f, n)
