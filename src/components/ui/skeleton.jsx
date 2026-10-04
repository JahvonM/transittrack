import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}) {
  return (
    (<div
      className={cn("tt-skeleton rounded-md", className)}
      {...props} />)
  );
}

export { Skeleton }
