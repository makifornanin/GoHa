/** Skeleton while the server reconciles and loads focus data. Finite and calm. */
export default function FocusLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-10" aria-hidden>
      <div className="space-y-3">
        <div className="h-8 w-40 rounded-lg bg-surface-container-high" />
        <div className="h-5 w-72 max-w-full rounded-lg bg-surface-container-high" />
      </div>
      <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-8">
        <div className="size-72 rounded-full bg-surface-container-high" />
        <div className="h-10 w-64 rounded-full bg-surface-container-high" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="h-24 rounded-xl border border-outline-variant bg-surface-container-high" />
        <div className="h-24 rounded-xl border border-outline-variant bg-surface-container-high" />
      </div>
    </div>
  );
}
