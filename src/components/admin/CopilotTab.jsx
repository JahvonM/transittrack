import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";

const SEV = {
  critical: { wrap: "border-red-500/30 bg-red-500/10 text-red-200", icon: AlertTriangle },
  warning: { wrap: "border-amber-500/30 bg-amber-500/10 text-amber-200", icon: AlertTriangle },
  info: { wrap: "border-sky-500/30 bg-sky-500/10 text-sky-200", icon: Info },
};

export default function CopilotTab() {
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const load = async () => {
    setLoading(true);
    setSent(false);
    try {
      const res = await base44.functions.invoke("adminCopilot", {});
      setBriefing(res.data?.briefing || null);
    } catch {
      setBriefing(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const sendBroadcast = async () => {
    const msg = briefing?.draft_broadcast;
    if (!msg) return;
    setSending(true);
    try {
      await base44.entities.Broadcast.create({ type: "info", message: msg });
      setSent(true);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="grid place-items-center py-16 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mb-3 text-primary" />
        Analyzing fleet activity…
      </div>
    );
  }

  if (!briefing) {
    return (
      <div className="py-10 text-center text-muted-foreground">
        <p className="mb-4">Couldn't generate a briefing right now.</p>
        <Button variant="outline" onClick={load}>
          <RefreshCw className="w-4 h-4 mr-2" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> Fleet briefing
          </CardTitle>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="w-4 h-4 mr-1.5" /> Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed">{briefing.summary}</p>
        </CardContent>
      </Card>

      {briefing.flags?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" /> Flags &amp; anomalies
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {briefing.flags.map((f, i) => {
              const s = SEV[f.severity] || SEV.info;
              const Icon = s.icon;
              return (
                <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${s.wrap}`}>
                  <Icon className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-medium text-sm">{f.title}</div>
                    <div className="text-xs opacity-90">{f.detail}</div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {briefing.suggested_actions?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" /> Suggested actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {briefing.suggested_actions.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-300 grid place-items-center text-xs shrink-0">
                    {i + 1}
                  </span>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {briefing.draft_broadcast && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="w-5 h-5 text-primary" /> Draft broadcast
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm p-3 rounded-lg bg-muted/50 border">{briefing.draft_broadcast}</p>
            <Button onClick={sendBroadcast} disabled={sending || sent}>
              {sent ? "Broadcast sent" : sending ? "Sending…" : "Send broadcast"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}