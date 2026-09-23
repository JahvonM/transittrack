import React from "react";

// A small friendly character for the kiosk — gives an otherwise purely
// functional check-in screen a bit of personality. "wave" sits beside the
// idle NFC icon with a gentle bob and a waving arm; "cheer" appears on a
// successful boarding with both arms up and a big grin. Pure inline SVG so
// it themes automatically via currentColor, no image assets needed.
export default function KioskMascot({ mood = "wave", size = 48 }) {
  const cheering = mood === "cheer";
  return (
    <div
      className={`text-primary ${cheering ? "animate-bounce" : ""}`}
      style={{ width: size, height: size, animationDuration: cheering ? "0.6s" : undefined }}
    >
      <style>{`
        @keyframes kiosk-mascot-idle-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
        @keyframes kiosk-mascot-wave-arm { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(-24deg); } }
        .kiosk-mascot-idle { animation: kiosk-mascot-idle-bob 2.2s ease-in-out infinite; }
        .kiosk-mascot-arm { transform-origin: 50px 34px; animation: kiosk-mascot-wave-arm 1.4s ease-in-out infinite; }
      `}</style>
      <svg viewBox="0 0 64 64" className={cheering ? "" : "kiosk-mascot-idle"} fill="none">
        {/* body */}
        <circle cx="32" cy="36" r="24" fill="currentColor" opacity="0.18" />
        <circle cx="32" cy="36" r="24" stroke="currentColor" strokeWidth="2" opacity="0.35" />
        {/* eyes */}
        {cheering ? (
          <>
            <path d="M21 32 L27 38 M27 32 L21 38" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M37 32 L43 38 M43 32 L37 38" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="24" cy="34" r="3.2" fill="currentColor" />
            <circle cx="40" cy="34" r="3.2" fill="currentColor" />
          </>
        )}
        {/* mouth */}
        {cheering ? (
          <path d="M20 42 Q32 56 44 42" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
        ) : (
          <path d="M22 42 Q32 48 42 42" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
        )}
        {/* arm(s) */}
        {cheering ? (
          <>
            <line x1="14" y1="36" x2="4" y2="20" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            <line x1="50" y1="36" x2="60" y2="20" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          </>
        ) : (
          <line x1="50" y1="34" x2="59" y2="22" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="kiosk-mascot-arm" />
        )}
      </svg>
    </div>
  );
}
