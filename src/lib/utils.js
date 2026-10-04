import { clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Teach tailwind-merge the design-system type scale (tailwind.config.js) so
// `text-title` etc. are treated as font sizes, not colours, when merged.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["caption", "body-sm", "body", "title-sm", "title", "headline", "display", "hero"] }],
    },
  },
})

export function cn(...inputs) {
  return twMerge(clsx(inputs))
} 


export const isIframe = window.self !== window.top;
