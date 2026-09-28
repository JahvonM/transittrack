import { createClient } from "@base44/sdk";
const c = createClient({ appId: "x", serverUrl: "http://localhost:1", requiresAuth: false });
const d = Object.getOwnPropertyDescriptor(c, "entities");
console.log("descriptor:", d && { writable: d.writable, configurable: d.configurable, hasGetter: !!d.get });
console.log("frozen:", Object.isFrozen(c));
try { c.entities = { probe: 1 }; console.log("assign ok:", c.entities.probe === 1); } catch (e) { console.log("assign failed", e.message); }
process.exit(0);
