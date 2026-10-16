import React, { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ROLE_SECTIONS } from "../../base44/shared/accessRoles.ts";

const cell = value => value == null || value === "" ? "—" : Array.isArray(value)
 ? value.map(item=>typeof item==="object"?item.name || item.id || "Item":String(item)).join(", ")
 : typeof value === "object" ? JSON.stringify(value) : String(value);
const label = value => value.replace(/_/g," ").replace(/^./,letter=>letter.toUpperCase());

export default function RoleWorkspace() {
 const { user, logout, checkUserAuth }=useAuth();
 const {section}=useParams();
 const role=user?.access_role;
 const first=role?.sections?.[0];
 const [data,setData]=useState(null),[error,setError]=useState(""),[loading,setLoading]=useState(false),[revision,setRevision]=useState(0);
 useEffect(()=>{
  if(!section || !role?.sections?.includes(section))return;
  let stopped=false;
  setData(null);setError("");setLoading(true);
  base44.functions.invoke("accessRoles",{action:"workspace",section}).then(({data:result})=>{if(!stopped)setData(result);})
   .catch(error=>{if(!stopped)setError(error.data?.error || error.response?.data?.error || "Couldn't load this screen. Try again.");})
   .finally(()=>{if(!stopped)setLoading(false);});
  return()=>{stopped=true;};
 },[section,role?.id,revision]);
 const more=async()=>{
  if(loading || !data)return;
  setLoading(true);setError("");
  try {
   const {data:page}=await base44.functions.invoke("accessRoles",{action:"workspace",section,skip:data.rows.length});
   setData(current=>({...page,rows:[...current.rows,...page.rows]}));
  } catch(error) {setError(error.data?.error || "Couldn't load more.");}
  finally {setLoading(false);}
 };
 if(user?.role==="admin")return <Navigate to="/admin/users" replace />;
 if(!role)return <main className="p-6"><p>No custom role is assigned to your account.</p><Button onClick={checkUserAuth}>Check access</Button><Button variant="outline" onClick={()=>logout()}>Sign out</Button></main>;
 if(!section && first)return <Navigate to={"/workspace/"+first} replace />;
 const allowed=role.sections.includes(section);
 return <div className="min-h-[100dvh] bg-background text-foreground">
  <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card p-4"><div><Link to="/workspace" className="font-bold">TransitTrack</Link><p className="text-sm text-muted-foreground">{role.name} · View-only workspace</p></div><Button variant="outline" onClick={()=>logout()}>Sign out</Button></header>
  <div className="mx-auto grid max-w-[1600px] gap-5 p-4 md:grid-cols-[220px_minmax(0,1fr)]">
   <nav className="flex flex-wrap gap-2 md:flex-col" aria-label="Assigned screens">{role.sections.map(key=><Link key={key} to={"/workspace/"+key} aria-current={key===section?"page":undefined} className={"rounded-xl border px-3 py-3 text-sm font-semibold "+(key===section?"bg-primary text-primary-foreground":"bg-card")}>{ROLE_SECTIONS[key]?.label || key}</Link>)}</nav>
   <main className="min-w-0 space-y-4">
    {!allowed ? <div role="alert" className="rounded-xl border bg-card p-6">This screen is not included in your role. Ask your administrator to enable the screens you need.</div> : <>
     <div className="flex items-center justify-between gap-3"><h1 className="text-2xl font-bold">{ROLE_SECTIONS[section]?.label}</h1><Button variant="outline" disabled={loading} onClick={()=>setRevision(value=>value+1)}>Refresh</Button></div>
     {error && <p role="alert" className="rounded-lg border border-danger p-3">{error}</p>}
     {loading && !data && <p role="status">Loading…</p>}
     {data && <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full text-left text-sm"><thead><tr>{data.fields.map(field=><th key={field} className="whitespace-nowrap border-b p-3">{label(field)}</th>)}</tr></thead><tbody>{data.rows.map(row=><tr key={row.id}>{data.fields.map(field=><td key={field} className="max-w-sm border-b p-3 align-top [overflow-wrap:anywhere]">{cell(row[field])}</td>)}</tr>)}</tbody></table>{!data.rows.length && <p className="p-6 text-muted-foreground">Nothing to show yet.</p>}</div>}
     {data?.more && <Button onClick={more} disabled={loading}>Show more</Button>}
    </>}
   </main>
  </div>
 </div>;
}
