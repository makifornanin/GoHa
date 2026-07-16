import { cn } from "@/lib/utils";

/** GoHa wordmark and mark. Neutral chrome; color belongs to user data. */
export function Brand({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue text-white">
        <span className="text-headline">G</span>
      </div>
      <div className="leading-tight">
        <p className="text-headline text-label">GoHa</p>
        <p className="text-footnote text-label-secondary">Life Operating System</p>
      </div>
    </div>
  );
}
