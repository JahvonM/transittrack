import React from "react";

const STEPS = [
  ["1", "Book or be added", "Request a ride from the website, or your company adds you to a staff bus."],
  ["2", "Choose your pickup", "Pick the stop nearest you — your bus is matched to it."],
  ["3", "Track and board", "Follow the bus on the map, then tap your card or code to board."],
];

export default function HowItWorks() {
  return (
    <section className="tt-welcome-steps" aria-labelledby="how-it-works">
      <h2 id="how-it-works">How it works</h2>
      <ol className="tt-welcome-step-list">
        {STEPS.map(([n, title, text]) => (
          <li key={n}>
            <span aria-hidden="true">{n}</span>
            <div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}