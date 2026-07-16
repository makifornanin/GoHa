/** Skeleton while the server fetches tasks. Finite and calm (CLAUDE.md section 9). */
export default function TasksLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-8" aria-hidden>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <div className="h-8 w-40 rounded-lg bg-surface-container-high" />
          <div className="h-5 w-80 max-w-full rounded-lg bg-surface-container-high" />
        </div>
        <div className="h-10 w-32 rounded-lg bg-surface-container-high" />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="flex flex-col gap-2 lg:col-span-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-10 rounded-lg bg-surface-container-high" />
          ))}
        </div>
        <div className="flex flex-col gap-4 lg:col-span-9">
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className="h-28 rounded-xl border border-outline-variant bg-surface-container-high"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
