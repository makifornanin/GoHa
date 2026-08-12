/** Skeleton while the week's statistics are derived. Finite and calm. */
export default function ReviewLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-hidden>
      <div className="space-y-3">
        <div className="h-8 w-48 rounded-lg bg-fill-tertiary" />
        <div className="h-5 w-96 max-w-full rounded-lg bg-fill-tertiary" />
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <div className="h-56 rounded-2xl border border-separator-opaque bg-fill-tertiary" />
          <div className="h-40 rounded-2xl border border-separator-opaque bg-fill-tertiary" />
        </div>
        <div className="lg:col-span-5">
          <div className="h-[30rem] rounded-2xl border border-separator-opaque bg-fill-tertiary" />
        </div>
      </div>
    </div>
  );
}
