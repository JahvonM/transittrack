import React, { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { ROLE_SECTIONS } from "../../../base44/shared/accessRoles.ts";

export default function CustomRoles({ users = [], onChange }) {
 const { toast } = useToast();
 const [roles,setRoles] = useState([]);
 const [roleId,setRoleId] = useState("");
 const [name,setName] = useState("");
 const [sections,setSections] = useState([]);
 const [active,setActive] = useState(true);
 const [userId,setUserId] = useState("");
 const [assignId,setAssignId] = useState("");
 const [busy,setBusy] = useState(false);
 const [loaded,setLoaded] = useState(false);
 const load = useCallback(async () => {
  try { const {data}=await base44.functions.invoke("accessRoles",{action:"list"});setRoles(data.roles || []);setLoaded(true); }
  catch(error) { toast({title:"Couldn't load custom roles",description:error.data?.error || error.message,variant:"destructive"}); }
 },[toast]);
 useEffect(()=>{load();},[load]);
 const choose = id => {
  setRoleId(id);const role=roles.find(r=>r.id===id);
  setName(role?.name || "");setSections(role?.sections || []);setActive(role?.active!==false);
 };
 const save = async () => {
  setBusy(true);
  try {
   const {data}=await base44.functions.invoke("accessRoles",{action:"save",role_id:roleId || undefined,name,sections,active});
   await load();setRoleId(data.role.id);setAssignId(data.role.id);
   toast({title:"Custom role saved",description:"Only the checked screens will be available."});
  } catch(error) { toast({title:"Couldn't save role",description:error.data?.error || error.message,variant:"destructive"}); }
  finally { setBusy(false); }
 };
 const assign = async () => {
  setBusy(true);
  try {
   await base44.functions.invoke("accessRoles",{action:"assign",user_id:userId,role_id:assignId});
   onChange?.();toast({title:"Role assignment saved",description:"They can reopen the app to load their workspace."});
  } catch(error) { toast({title:"Couldn't assign role",description:error.data?.error || error.message,variant:"destructive"}); }
  finally { setBusy(false); }
 };
 return <section className="mb-6 space-y-4 rounded-2xl border bg-card p-4" aria-label="Custom roles">
  <div><h2 className="text-xl font-semibold">Custom roles</h2><p className="mt-1 text-sm text-muted-foreground">Create a named role and tick the admin information it can view across companies. These roles are view-only. Full administrators keep full access.</p></div>
  <div className="grid gap-5 lg:grid-cols-2">
   <div className="space-y-3">
    <label className="block text-sm font-medium">Edit role<select aria-label="Edit custom role" className="mt-1 min-h-11 w-full rounded-lg border bg-background p-2" value={roleId} onChange={e=>choose(e.target.value)}>
     <option value="">New custom role</option>{roles.map(role=><option key={role.id} value={role.id}>{role.name}{role.active===false?" (disabled)":""}</option>)}
    </select></label>
    <label className="block text-sm font-medium">Role name<Input aria-label="Custom role name" maxLength={80} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Fleet supervisor" /></label>
    <fieldset className="grid gap-2 sm:grid-cols-2"><legend className="mb-2 text-sm font-semibold">Screens they can see</legend>
     {Object.entries(ROLE_SECTIONS).map(([key,spec])=><label key={key} className="flex min-h-11 items-center gap-3 rounded-xl border px-3 text-sm"><input type="checkbox" checked={sections.includes(key)} onChange={e=>setSections(current=>e.target.checked?[...current,key]:current.filter(value=>value!==key))} />{spec.label}</label>)}
    </fieldset>
    <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)} />Role enabled</label>
    <Button disabled={busy || !loaded || !name.trim()} onClick={save}>{busy?"Saving…":"Save custom role"}</Button>
   </div>
   <div className="space-y-3 rounded-xl border p-4">
    <h3 className="font-semibold">Assign to an account</h3>
    <p className="text-sm text-muted-foreground">Assigning a custom role replaces their standard company, mechanic or driver access with the selected view-only workspace. Removing it leaves a regular hotel-staff account.</p>
    <label className="block text-sm font-medium">Account<select aria-label="Custom role account" className="mt-1 min-h-11 w-full rounded-lg border bg-background p-2" value={userId} onChange={e=>setUserId(e.target.value)}>
     <option value="">Choose account</option>{users.filter(user=>user.role!=="admin").map(user=><option key={user.id} value={user.id}>{user.display_name || user.full_name || user.email} · {user.email}</option>)}
    </select></label>
    <label className="block text-sm font-medium">Assigned role<select aria-label="Assign custom role" className="mt-1 min-h-11 w-full rounded-lg border bg-background p-2" value={assignId} onChange={e=>setAssignId(e.target.value)}>
     <option value="">Remove custom role</option>{roles.filter(role=>role.active!==false).map(role=><option key={role.id} value={role.id}>{role.name}</option>)}
    </select></label>
    <Button disabled={busy || !userId} onClick={assign}>Apply assignment</Button>
    <Button variant="outline" onClick={load} disabled={busy}>Refresh roles</Button>
   </div>
  </div>
 </section>;
}
