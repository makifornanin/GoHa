/** Skeleton while the server loads maps and the active graph. Finite and calm. */
export default function TaskMapsLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-hidden>
      <div className="space-y-3">
        <div className="h-8 w-40 rounded-lg bg-surface-container-high" />
        <div className="h-5 w-96 max-w-full rounded-lg bg-surface-container-high" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <div className="h-[600px] rounded-xl border border-outline-variant bg-surface-container-high lg:h-[calc(100vh-13rem)]" />
        <div className="h-[600px] rounded-xl border border-outline-variant bg-surface-container-high lg:h-[calc(100vh-13rem)]" />
      </div>
    </div>
  );
}
