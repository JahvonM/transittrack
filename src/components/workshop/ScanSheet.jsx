import React, { Suspense, lazy, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { StockChip } from "@/components/admin/partsCatalogueKit";
import QuickAddPart from "@/components/admin/QuickAddPart";
import { partFromScan } from "@/lib/workshop";
import { useWorkshop } from "@/components/workshop/kit";
import { Plus, ScanLine, Search } from "lucide-react";

// The camera is a big download, so it loads only when the scanner opens.
const QrScanner = lazy(() => import("@/components/kiosk/QrScanner"));
// The same list as PART_CODES in QrScanner.jsx, copied so this page doesn't
// load the camera library until the scanner opens.
const PART_CODES = ["QR_CODE", "CODE_128", "CODE_39", "EAN_13", "EAN_8", "UPC_A", "UPC_E", "ITF"];

// Scan a part's barcode (or type its number) to find it on the shelves: one
// part opens its page, several are offered to choose from, and a number not
// in the parts can be added straight away.
export default function ScanSheet({ open, onOpenChange }) {
  const navigate = useNavigate();
  const { parts, interchanges, guides, put } = useWorkshop();
  const [result, setResult] = useState(null);
  const [typed, setTyped] = useState("");
  const [adding, setAdding] = useState(null);

  const close = () => { setResult(null); setTyped(""); onOpenChange(false); };
  const find = (text) => {
    const found = partFromScan(text, parts, interchanges);
    if (found.matches.length === 1) {
      close();
      navigate(`/workshop/parts/${found.matches[0].id}`);
      return;
    }
    setResult(found);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => { if (!next) close(); }}>
        <SheetContent side="right" className="flex h-[100dvh] w-full flex-col gap-0 p-0 sm:max-w-xl [&>button]:hidden" onOpenAutoFocus={(e) => e.preventDefault()}>
          <div className="safe-area-top flex items-center gap-2 border-b border-border px-4 py-3">
            <Button type="button" variant="ghost" className="h-12 rounded-xl px-3 text-body" onClick={close}>Close</Button>
            <div className="min-w-0 flex-1 text-center">
              <SheetTitle className="truncate text-body font-semibold">Scan a part</SheetTitle>
              <SheetDescription className="truncate text-caption">The barcode or QR on the box or label</SheetDescription>
            </div>
            <span className="w-[4.5rem]" aria-hidden="true" />
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4">
            {/* Typing a number pauses the camera, so the screen can't jump
                away mid-typing; clearing the box starts it again. */}
            {open && (
              <Suspense fallback={<p role="status" className="py-10 text-center text-body-sm text-muted-foreground">Starting the camera…</p>}>
                <QrScanner active={!result && !typed} keepWhenPaused onDecode={find} formats={PART_CODES} box="wide" what="barcode" />
              </Suspense>
            )}
            {!result && <p className="text-center text-body-sm text-muted-foreground">{typed ? "Camera paused while you type. Clear the box to scan again." : "Hold the barcode inside the box. It scans by itself."}</p>}

            {result && (
              <section aria-label="Scan result" className="space-y-3">
                <p className="text-body-sm text-muted-foreground">Scanned <strong className="tabular-nums text-foreground">{result.number}</strong></p>
                {result.matches.length > 1 ? (
                  <>
                    <p className="font-semibold">Which one?</p>
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {result.matches.map((part) => (
                        <li key={part.id}>
                          <button type="button" onClick={() => { close(); navigate(`/workshop/parts/${part.id}`); }} className="flex min-h-[3.5rem] w-full items-center gap-3 px-3 py-2 text-left hover:bg-secondary/60">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-semibold text-primary">{part.part_name}</span>
                              <span className="block truncate text-body-sm text-muted-foreground">{[part.oem_number, part.aftermarket_number, part.bin_location].filter(Boolean).join(" · ")}</span>
                            </span>
                            <StockChip part={part} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="font-semibold">Not in your parts</p>
                    <p className="text-body-sm text-muted-foreground">No part on the shelves has this number or a replacement for it.</p>
                    <Button className="mt-3 h-12 rounded-lg text-body" onClick={() => { setAdding({ number: result.number }); close(); }}>
                      <Plus className="mr-1.5 h-5 w-5" aria-hidden="true" />Add it
                    </Button>
                  </div>
                )}
                <Button variant="outline" className="h-12 rounded-lg text-body" onClick={() => setResult(null)}><ScanLine className="mr-1.5 h-4 w-4" aria-hidden="true" />Scan another</Button>
              </section>
            )}

            <form onSubmit={(e) => { e.preventDefault(); if (typed.trim()) find(typed); }} className="space-y-1.5 border-t border-border pt-4">
              <label htmlFor="scan-typed" className="block text-body-sm font-semibold">Or type the number instead</label>
              <div className="flex gap-2">
                <Input id="scan-typed" value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false} placeholder="90915-YZZD2" className="h-12 min-w-0 flex-1 text-body md:text-body" />
                <Button type="submit" className="h-12 rounded-lg text-body" disabled={!typed.trim()}><Search className="mr-1.5 h-4 w-4" aria-hidden="true" />Find</Button>
              </div>
            </form>
          </div>
        </SheetContent>
      </Sheet>
      <QuickAddPart open={!!adding} onOpenChange={(o) => { if (!o) setAdding(null); }} parts={parts} guides={guides} initial={adding || undefined} onSaved={(saved) => put("parts", saved)} />
    </>
  );
}
