import React, { useState } from "react";
import "@/components/tablet/tabletSettings.css";

// Tablet settings, split into sections like the native kiosk settings: a side
// menu on a tablet, tabs across the top on a phone. Each section is a list
// of the existing panels; a panel that needs the kiosk app shows nothing in a
// browser, and an empty section says so.
//
// sections: [{ id, label, content }]
export default function TabletSettings({ title = "Tablet settings", subtitle, sections, onDone, doneLabel = "Done", headingLevel = 1, className }) {
  const [open, setOpen] = useState(sections[0]?.id);
  const current = sections.find((s) => s.id === open) || sections[0];
  const Heading = headingLevel === 2 ? "h2" : "h1";
  return (
    <div className={className ? `ts ${className}` : "ts"}>
      <div className="ts-head">
        <div>
          <Heading>{title}</Heading>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {onDone && <button type="button" className="ts-done" onClick={onDone}>{doneLabel}</button>}
      </div>
      <div className="ts-main">
        <nav className="ts-nav" aria-label="Settings sections">
          {sections.map((s) => (
            <button key={s.id} type="button" aria-current={s.id === current?.id ? "true" : undefined} onClick={() => setOpen(s.id)}>
              {s.label}
            </button>
          ))}
        </nav>
        <div className="ts-body" key={current?.id}>{current?.content}</div>
      </div>
    </div>
  );
}
