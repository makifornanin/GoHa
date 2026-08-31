/** Skeleton while a goal loads. Finite and calm (CLAUDE.md section 9). */
export default function GoalDetailLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-hidden>
      <div className="h-4 w-64 max-w-full rounded bg-fill-tertiary" />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="h-5 w-16 rounded-sm bg-fill-tertiary" />
            <div className="h-5 w-20 rounded-sm bg-fill-tertiary" />
          </div>
          <div className="h-8 w-72 max-w-full rounded-lg bg-fill-tertiary" />
          <div className="h-5 w-96 max-w-full rounded-lg bg-fill-tertiary" />
        </div>
        <div className="h-9 w-32 rounded-lg bg-fill-tertiary" />
      </div>

      <div className="h-36 rounded-2xl border border-separator-opaque bg-surface" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-5 w-32 rounded bg-fill-tertiary" />
              {Array.from({ length: 3 }, (_, row) => (
                <div
                  key={row}
                  className="h-14 rounded-xl border border-separator-opaque bg-surface"
                />
              ))}
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <div className="h-5 w-24 rounded bg-fill-tertiary" />
          <div className="h-24 rounded-xl bg-fill-quaternary" />
        </div>
      </div>
    </div>
  );
}
