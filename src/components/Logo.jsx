import React from "react";
import { Image } from "@/components/ui/image";

export const LOGO_URL =
  "https://media.base44.com/images/public/6a98b192be27b5f9635020ba/816fbe4ae_b65f2f18-9838-4b11-9bc9-24fadae4e868.jpeg";

export default function Logo({ className = "w-8 h-8" }) {
  return (
    <Image
      src={LOGO_URL}
      alt="MCSween's Transport and Reside Co."
      fittingType="fill"
      className={`${className} rounded-full overflow-hidden shrink-0`}
    />
  );
}