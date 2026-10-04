import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils"

// Heights: sm 36px · default 40px (44px on touch screens via index.css) ·
// lg 48px · xl 64px (driver controls). Icon buttons match.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-[color,background-color,border-color,box-shadow,transform] duration-fast ease-out-soft active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3 text-xs",
        lg: "h-12 rounded-md px-6 text-base [&_svg]:size-5",
        xl: "h-16 rounded-lg px-8 text-lg [&_svg]:size-6",
        icon: "h-10 w-10",
        "icon-sm": "h-9 w-9",
        "icon-lg": "h-12 w-12 [&_svg]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

// `loading` shows a spinner, disables the button and marks it busy for
// screen readers. It never changes what the button does.
const Button = React.forwardRef(({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    (<Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      disabled={asChild ? disabled : disabled || loading}
      aria-busy={loading || undefined}
      {...props}>
      {loading && !asChild ? <><Loader2 className="animate-spin" aria-hidden="true" />{children}</> : children}
    </Comp>)
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }
