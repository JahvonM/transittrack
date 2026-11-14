import React from "react";
import "./busSign.css";

// The destination sign on the front of a bus, lit in dots, as on the website
// (src/site/DestinationSign.jsx) but still: one name, no animation. The real
// text stays in the page for screen readers, search and copying.
export default function BusSign({ text, className = "" }) {
  if (!text) return null;
  return (
    <span className={`tt-bus-sign ${className}`.trim()}>
      <span className="tt-bus-sign-text">{text}</span>
    </span>
  );
}
