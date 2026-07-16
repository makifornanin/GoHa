/** Skeleton while the server loads the owner's settings. Finite and calm. */
export default function SettingsLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-hidden>
      <div className="space-y-3">
        <div className="h-8 w-40 rounded-lg bg-surface-container-high" />
        <div className="h-5 w-96 max-w-full rounded-lg bg-surface-container-high" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-56 rounded-xl border border-outline-variant bg-surface-container-high lg:col-span-2" />
        <div className="h-48 rounded-xl border border-outline-variant bg-surface-container-high" />
        <div className="h-48 rounded-xl border border-outline-variant bg-surface-container-high" />
      </div>
    </div>
  );
}
