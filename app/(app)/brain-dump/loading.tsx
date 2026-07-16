/** Skeleton while the server loads captured items. Finite and calm. */
export default function BrainDumpLoading() {
  return (
    <div className="mx-auto flex w-full max-w-3xl animate-pulse flex-col gap-8" aria-hidden>
      <div className="space-y-3">
        <div className="h-8 w-44 rounded-lg bg-surface-container-high" />
        <div className="h-5 w-72 max-w-full rounded-lg bg-surface-container-high" />
      </div>
      <div className="h-40 rounded-xl border border-outline-variant bg-surface-container-high" />
      <div className="flex flex-col gap-4">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-28 rounded-lg border border-outline-variant bg-surface-container-high" />
        ))}
      </div>
    </div>
  );
}
