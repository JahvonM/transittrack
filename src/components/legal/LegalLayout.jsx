import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import Logo from "@/components/Logo";

// Shared chrome for the public legal pages (/privacy, /terms). The app stores
// link straight to these URLs, so they must render for signed-out visitors.
export default function LegalLayout({ title, children }) {
  return (
    <div className="tt-app-shell min-h-screen bg-background">
      <header className="safe-area-top sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 font-heading text-title-sm font-bold">
            <Logo className="h-8 w-8" />
            <span>
              Transit<span className="text-primary">Track</span>
            </span>
          </Link>
          <Link
            to="/"
            className="ml-auto inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-body-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <h1 className="text-display font-bold">{title}</h1>

        {/* Remove this notice once the placeholders below are replaced. */}
        <div
          role="note"
          className="mt-6 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-body-sm"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
          <span>
            <span className="font-semibold">Placeholder text.</span> Replace everything in square
            brackets, such as [COMPANY NAME], [CONTACT EMAIL] and [JURISDICTION], with your own
            details before publishing. Delete this notice when you are done. This wording is a
            starting point and is not legal advice.
          </span>
        </div>

        <div className="mt-8 space-y-8">{children}</div>

        <nav
          aria-label="Legal"
          className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-6 text-body-sm"
        >
          <Link to="/privacy" className="font-semibold text-primary hover:underline">
            Privacy Policy
          </Link>
          <Link to="/terms" className="font-semibold text-primary hover:underline">
            Terms of Service
          </Link>
          <a href="mailto:[CONTACT EMAIL]" className="text-muted-foreground hover:text-foreground">
            [CONTACT EMAIL]
          </a>
        </nav>
      </main>
    </div>
  );
}

// One numbered section. Keep the heading short; put lists inside children.
export function LegalSection({ title, children }) {
  return (
    <section className="space-y-3">
      <h2 className="font-heading text-title-sm font-bold text-foreground">{title}</h2>
      <div className="space-y-3 text-body-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}