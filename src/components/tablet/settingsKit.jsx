import React from "react";

// The panels in tablet settings use these instead of the app's Card, so every
// section looks the same (tabletSettings.css). Same names and props as
// @/components/ui/card, so a panel only changes its import.
const join = (...c) => c.filter(Boolean).join(" ");
export function Card({ className, children, ...rest }) {
  return <section className={join("ts-card", className)} {...rest}>{children}</section>;
}
export function CardHeader({ className, children }) {
  return <div className={join("ts-card-head", className)}>{children}</div>;
}
export function CardTitle({ className, children }) {
  return <h2 className={join("ts-card-title", className)}>{children}</h2>;
}
export function CardContent({ className, children }) {
  return <div className={join("ts-card-body", className)}>{children}</div>;
}
