/** Skeleton while the day's plan loads. Finite and calm (CLAUDE.md section 9). */
export default function PlannerLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-hidden>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <div className="h-8 w-44 rounded-lg bg-fill-tertiary" />
          <div className="h-5 w-80 max-w-full rounded-lg bg-fill-tertiary" />
        </div>
        <div className="h-9 w-44 rounded-lg bg-fill-tertiary" />
      </div>

      <div className="h-32 rounded-2xl border border-separator-opaque bg-surface" />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="h-56 rounded-2xl border border-separator-opaque bg-surface"
          />
        ))}
      </div>
    </div>
  );
}
