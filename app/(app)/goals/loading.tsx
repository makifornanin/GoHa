/** Skeleton while the server fetches goals. Finite and calm (CLAUDE.md section 9). */
export default function GoalsLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-8" aria-hidden>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <div className="h-8 w-40 rounded-lg bg-surface-container-high" />
          <div className="h-5 w-80 max-w-full rounded-lg bg-surface-container-high" />
        </div>
        <div className="h-10 w-32 rounded-lg bg-surface-container-high" />
      </div>

      <div className="flex gap-6 border-b border-outline-variant pb-3">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-5 w-20 rounded bg-surface-container-high" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="h-64 rounded-xl border border-outline-variant bg-surface-container-high"
          />
        ))}
      </div>
    </div>
  );
}
