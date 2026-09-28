import React, { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// In-app replacement for window.confirm. Call `await confirmAction({...})`
// from anywhere; the single <ConfirmHost /> mounted in App.jsx shows it.
let openDialog = null;

export function confirmAction(opts) {
  const options = typeof opts === "string" ? { title: opts } : opts;
  if (!openDialog) return Promise.resolve(window.confirm(options.title));
  return new Promise((resolve) => openDialog({ ...options, resolve }));
}

export default function ConfirmHost() {
  const [req, setReq] = useState(null);

  useEffect(() => {
    openDialog = setReq;
    return () => { openDialog = null; };
  }, []);

  const close = (answer) => {
    req?.resolve(answer);
    setReq(null);
  };

  return (
    <AlertDialog open={!!req} onOpenChange={(open) => { if (!open) close(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{req?.title}</AlertDialogTitle>
          {req?.description && <AlertDialogDescription>{req.description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => close(true)}
            className={req?.destructive === false ? "" : "bg-destructive text-destructive-foreground hover:bg-destructive/90"}
          >
            {req?.confirmLabel || "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
