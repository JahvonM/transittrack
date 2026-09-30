p = 'src/components/driver/DriverNavMap.jsx'
s = open(p).read()
s = s.replace('import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";',
              'import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";', 1)
s = s.replace('import LiteMap from "@/components/LiteMap";\n', '', 1)
s = s.replace('import { mapEngine, markFullMapFailed } from "@/lib/mapEngine";',
              'import { mapEngine, markFullMapFailed } from "@/lib/mapEngine";\n\n// Basic map for tablets without WebGL 2 — loaded only on those devices.\nconst LiteMap = lazy(() => import("@/components/LiteMap"));', 1)
s = s.replace('''        {basicMap ? (
          <LiteMap''', '''        {basicMap ? (
          <Suspense fallback={null}>
          <LiteMap''', 1)
old = '''            ]}
          />
        ) : ('''
assert old in s
s = s.replace(old, '''            ]}
          />
          </Suspense>
        ) : (''', 1)
open(p, 'w').write(s)

# Heartbeat tells the server how this tablet draws maps (shown on the device record).
p = 'src/hooks/useDriverSession.js'
import os
if not os.path.exists(p):
    p = 'src/hooks/useDriverSession.jsx'
s = open(p).read()
old = 'const res = await base44.functions.invoke("driverSession", { device_id: deviceId, action: "heartbeat" });'
assert old in s
s = s.replace(old, '''const first = !sentInfoRef.current;
      sentInfoRef.current = true;
      const res = await base44.functions.invoke("driverSession", {
        device_id: deviceId, action: "heartbeat",
        ...(first ? { device_info: deviceMapInfo() } : {}),
      });''', 1)
open(p, 'w').write(s)
print(p)
print(s[:900])
