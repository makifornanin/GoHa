/** Skeleton while the server fetches habits + entries. Finite and calm. */
export default function HabitsLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-8" aria-hidden>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <div className="h-8 w-56 rounded-lg bg-surface-container-high" />
          <div className="h-5 w-64 max-w-full rounded-lg bg-surface-container-high" />
        </div>
        <div className="h-10 w-32 rounded-lg bg-surface-container-high" />
      </div>
      <div className="h-56 rounded-xl border border-outline-variant bg-surface-container-high" />
      <div className="h-64 rounded-xl border border-outline-variant bg-surface-container-high" />
    </div>
  );
}
