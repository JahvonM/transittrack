def sub(f, old, new):
    s = open(f).read()
    assert old in s, (f, old[:60])
    open(f, "w").write(s.replace(old, new, 1))

sub("src/lib/AuthContext.jsx", "import { appParams } from '@/lib/app-params';",
    "import { appParams } from '@/lib/app-params';\nimport { setAuditActor } from '@/lib/auditLog';")
sub("src/lib/AuthContext.jsx", "      setUser(currentUser);\n      setIsAuthenticated(true);",
    "      setUser(currentUser);\n      setAuditActor(currentUser);\n      setIsAuthenticated(true);")
sub("src/lib/AuthContext.jsx", "  const logout = (shouldRedirect = true) => {\n    setUser(null);",
    "  const logout = (shouldRedirect = true) => {\n    setUser(null);\n    setAuditActor(null);")

open("src/api/base44Client.js", "w").write('''import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { withAuditLog } from '@/lib/auditLog';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  appBaseUrl
});

// Record admin/staff edits in the AuditLog ("Change history" in Admin).
base44.entities = withAuditLog(base44.entities);
''')
print("wired")
