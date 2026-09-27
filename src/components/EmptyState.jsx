import React from "react";
import AnimatedBus from "@/components/AnimatedBus";

// Friendly empty state: a parked bus that gently rolls in, plus the message.
export default function EmptyState({ text, children, className = "" }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center gap-3 py-8 ${className}`}>
      <div className="opacity-60">
        <AnimatedBus mode="arrive" width={110} />
      </div>
      <p className="text-sm text-muted-foreground max-w-xs">{text}</p>
      {children}
    </div>
  );
}
