/** Skeleton while the history is derived. Finite and calm, never endless. */
export default function ProgressLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-hidden>
      <div className="space-y-3">
        <div className="h-8 w-40 rounded-lg bg-fill-tertiary" />
        <div className="h-5 w-[28rem] max-w-full rounded-lg bg-fill-tertiary" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 rounded-2xl border border-separator-opaque bg-fill-tertiary" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-56 rounded-2xl border border-separator-opaque bg-fill-tertiary" />
        <div className="h-56 rounded-2xl border border-separator-opaque bg-fill-tertiary" />
      </div>
      <div className="h-48 rounded-2xl border border-separator-opaque bg-fill-tertiary" />
    </div>
  );
}
