import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import BoardingCodeForm from "@/components/staff/BoardingCodeForm";
import useBoardingPass from "@/components/staff/useBoardingPass";

export default function BoardingPass() {
  const { pass, loading, saving, save, problem, saveError, retry } = useBoardingPass();
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Bus boarding</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {loading && <p role="status" className="text-sm text-muted-foreground">Loading your boarding QR…</p>}
        {problem && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{problem}</p><Button variant="outline" onClick={retry}>Try again</Button></div>}
        {pass && !problem && <>
          <div className="space-y-2 text-center">
            <Image src={pass.qrUrl} alt="Permanent personal bus boarding QR" className="mx-auto h-56 w-56 max-w-full rounded-lg border" fittingType="fit" />
            <p className="font-medium">My permanent boarding QR</p>
            <p className="text-sm text-muted-foreground">Scan this each time you board or exit your assigned bus. It doesn't expire and stays the same when you change your code.</p>
            <p className="text-xs text-muted-foreground">Keep your QR private, just like your badge.</p>
          </div>
          <BoardingCodeForm hasCode={pass.has_code} saving={saving} onSave={save} error={saveError} />
        </>}
      </CardContent>
    </Card>
  );
}