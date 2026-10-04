import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Send, Sparkles } from "lucide-react";

export default function BusAssistant({ company, userLoc, bare = false }) {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  const ask = async () => {
    if (!q.trim()) return;
    setLoading(true);
    setAnswer("");
    try {
      const res = await base44.functions.invoke("busAssistant", {
        question: q,
        company_id: company?.id,
        user_lat: userLoc?.lat,
        user_lng: userLoc?.lng,
      });
      setAnswer(res.data?.answer || "Sorry, I couldn't work that out.");
    } catch {
      setAnswer("Sorry, I couldn't reach the assistant right now.");
    } finally {
      setLoading(false);
    }
  };

  const form = (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder="e.g. How far away is the next bus?"
          aria-label="Your question"
          className="h-12"
        />
        <Button onClick={ask} disabled={loading || !q.trim()} size="lg" aria-label="Ask">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
      {answer && <p className="text-body text-foreground leading-relaxed" aria-live="polite">{answer}</p>}
    </div>
  );
  if (bare) return form;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="w-4 h-4 text-primary" /> Ask about your bus
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
            placeholder="e.g. How far away is the next bus?"
          />
          <Button onClick={ask} disabled={loading || !q.trim()}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
        {answer && (
          <p className="text-sm text-muted-foreground leading-relaxed">{answer}</p>
        )}
      </CardContent>
    </Card>
  );
}