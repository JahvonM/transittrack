import React, { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

const EMPTY = "__tt_empty_choice__";
export default function ChoicePicker({ value, onValueChange, options, label, id, disabled, className }) {
 const mobile=useIsMobile(),[open,setOpen]=useState(false);
 const selected=options.find(o=>o.value===value);
 if(!mobile)return <Select value={value||EMPTY} onValueChange={v=>onValueChange(v===EMPTY?"":v)} disabled={disabled}>
  <SelectTrigger id={id} aria-label={label} className={className}><SelectValue /></SelectTrigger>
  <SelectContent>{options.map(o=><SelectItem key={o.value||EMPTY} value={o.value||EMPTY} disabled={o.disabled}>{o.label}</SelectItem>)}</SelectContent>
 </Select>;
 return <>
  <Button type="button" id={id} variant="outline" aria-label={label} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={()=>setOpen(true)} className={"min-h-12 w-full justify-between text-left "+(className||"")}>
   <span className="truncate">{selected?.label||"Choose…"}</span><ChevronDown className="ml-2 h-4 w-4 shrink-0" />
  </Button>
  <Sheet open={open} onOpenChange={setOpen}><SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto rounded-t-3xl">
   <SheetHeader><SheetTitle>{label}</SheetTitle><SheetDescription>Choose one option.</SheetDescription></SheetHeader>
   <div role="listbox" aria-label={label} className="mt-4 space-y-1">{options.map(o=><button type="button" role="option" aria-selected={o.value===value} disabled={o.disabled} key={o.value} onClick={()=>{onValueChange(o.value);setOpen(false);}} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left hover:bg-accent disabled:opacity-50">
    <span className="break-words">{o.label}</span>{o.value===value&&<Check className="h-5 w-5 shrink-0 text-primary" />}
   </button>)}</div>
  </SheetContent></Sheet>
 </>;
}

export function ChoiceSelect({children,onChange,value="",...props}){
 const options=React.Children.toArray(children).filter(React.isValidElement).map(o=>({value:o.props.value,label:o.props.children,disabled:o.props.disabled}));
 const label=props["aria-label"]||props.label||"Choose an option";
 return <ChoicePicker value={value} onValueChange={v=>onChange?.({target:{value:v}})} options={options} label={label} id={props.id} disabled={props.disabled} className={props.className} />;
}
