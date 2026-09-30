p = 'src/pages/DriverApp.jsx'
s = open(p).read()

def rep(old, new):
    global s
    assert old in s, old[:90]
    s = s.replace(old, new, 1)

start = s.index('''  return (
    <div className="min-h-screen p-4 safe-area-top safe-area-x">
      <div className="space-y-4 max-w-6xl mx-auto">
        <Button''')
end = s.index('''      <DriverMessageAlert alert={alert}''')
new_main = '''  const selectTab = (v) => {
    setActiveTab(v);
    navigate("/driver/" + v, { replace: true });
  };

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-background safe-area-top safe-area-x">
      <DriverTopBar
        driverName={driverName}
        busName={vehicle.name}
        left={activeTab !== "track" ? (
          <Button variant="ghost" size="icon" className="min-w-[44px] min-h-[44px] -ml-1" onClick={goBack} aria-label="Back to Drive">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        ) : null}
      />

      <main className="flex-1 min-h-0 relative">
        {/* Drive stays mounted so GPS tracking keeps running while another tab is open. */}
        <section className={`absolute inset-0 p-3 ${activeTab === "track" ? "" : "invisible pointer-events-none"}`} aria-hidden={activeTab !== "track"}>
          <DriverTrackingDashboard
            session={session}
            invoke={invoke}
            onReportIncident={() => setIsReportOpen(true)}
            panelTop={(
              <>
                {dueInspections.length > 0 && (
                  <DueInspectionsBanner due={dueInspections} onStart={(t) => openInspection(t, { from: "unlock" })} />
                )}
                <ShiftCard session={session} invoke={invoke} refresh={refresh} beforeStart={() => beforeShift("start_shift")} beforeEnd={() => beforeShift("end_shift")} />
              </>
            )}
            panelBottom={session.trips?.length > 0 ? (
              <DriverTrips
                trips={session.trips}
                invoke={invoke}
                refresh={refresh}
                startSharing={() => invoke("start_tracking").catch(() => {})}
              />
            ) : null}
          />
        </section>
        {activeTab !== "track" && (
          <section className="absolute inset-0 overflow-y-auto overscroll-contain p-3 sm:p-4">
            <div className="max-w-3xl mx-auto space-y-4">
              {activeTab === "chat" && <DriverChats session={session} invoke={invoke} onUnreadChange={setHasUnreadChat} />}
              {activeTab === "safety" && (
                <>
                  <DriverInspectionList
                    templates={inspTemplates}
                    recent={recentInspections}
                    localDone={localDone}
                    onStart={(t) => openInspection(t, { from: "manual" })}
                  />
                  <SafetyStandardsContent />
                </>
              )}
              {activeTab === "profile" && <DriverDevicePanel session={session} deviceId={deviceId} onUnpair={handleUnpair} />}
            </div>
          </section>
        )}
      </main>

      <nav className="shrink-0 grid grid-cols-4 border-t border-border bg-card/95 backdrop-blur safe-area-bottom" aria-label="Driver sections">
        {DRIVER_TABS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => selectTab(id)}
              aria-current={active ? "page" : undefined}
              className={`relative flex flex-col items-center justify-center gap-1 h-16 text-xs font-semibold transition-colors ${active ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              {active && <span className="absolute top-0 inset-x-6 h-0.5 rounded-full bg-primary" aria-hidden="true" />}
              <Icon className="w-6 h-6" aria-hidden="true" />
              {label}
              {id === "chat" && hasUnreadChat && <span className="absolute top-2.5 left-1/2 ml-2.5 w-2.5 h-2.5 rounded-full bg-destructive" aria-label="Unread messages" />}
            </button>
          );
        })}
      </nav>

'''
s = s[:start] + new_main + s[end:]

# The main screen's outer wrapper closed two divs; now it closes one.
rep('''          </SheetContent>
        </Sheet>
    </div>''', '''          </SheetContent>
        </Sheet>
    </div>''') if '''          </SheetContent>
        </Sheet>
    </div>''' in s else None

rep('const TRACKING_TABS = ["track", "navigate", "chat", "safety", "profile"];',
    '''// "navigate" is kept as an alias: Track and Navigate are now one Drive screen.
const TRACKING_TABS = ["track", "navigate", "chat", "safety", "profile"];
const DRIVER_TABS = [
  { id: "track", label: "Drive", icon: Navigation },
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "safety", label: "Safety", icon: ShieldCheck },
  { id: "profile", label: "Profile", icon: UserRound },
];
const tabFromStage = (st) => (st === "navigate" ? "track" : TRACKING_TABS.includes(st) ? st : null);''')
rep('''  const [activeTab, setActiveTab] = useState(() => TRACKING_TABS.includes(urlStage) ? urlStage : "track");''',
    '''  const [activeTab, setActiveTab] = useState(() => tabFromStage(urlStage) || "track");
  // Follow the URL (e.g. "Continue" after an inspection goes to /driver/track).
  useEffect(() => { const t = tabFromStage(urlStage); if (t) setActiveTab(t); }, [urlStage]);''')
rep('import { AlertCircle, AlertTriangle, ArrowLeft, MessageCircle, ShieldCheck } from "lucide-react";',
    'import { AlertCircle, AlertTriangle, ArrowLeft, MessageCircle, Navigation, ShieldCheck, UserRound } from "lucide-react";')
rep('import DriverGreeting from "@/components/driver/DriverGreeting";',
    'import DriverGreeting, { DriverTopBar } from "@/components/driver/DriverGreeting";')
s = s.replace('import DriverNavMap from "@/components/driver/DriverNavMap";\n', '', 1)
s = s.replace('import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";\n', '', 1)
rep('''    if (activeTab !== "track") { goStage("track"); return; }''',
    '''    if (activeTab !== "track") { setActiveTab("track"); goStage("track"); return; }''')
open(p, 'w').write(s)
print('ok')
