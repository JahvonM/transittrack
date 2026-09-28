import React from "react";

export const LOGO_URL = "/brand/icon.svg";

export default function Logo({ className = "w-8 h-8" }) {
  return (
    <img
      src={LOGO_URL}
      alt="TransitTrack"
      className={`${className} rounded-[28%] shrink-0 object-contain`}
    />
  );
}
