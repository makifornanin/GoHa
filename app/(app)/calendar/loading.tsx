/** Skeleton while the month's tasks, habits, and focus load. Finite and calm. */
export default function CalendarLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-hidden>
      <div className="space-y-3">
        <div className="h-8 w-40 rounded-lg bg-fill-tertiary" />
        <div className="h-5 w-96 max-w-full rounded-lg bg-fill-tertiary" />
      </div>
      <div className="h-8 w-72 rounded-lg bg-fill-tertiary" />
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="h-[36rem] rounded-2xl border border-separator-opaque bg-fill-tertiary xl:col-span-8" />
        <div className="h-64 rounded-2xl border border-separator-opaque bg-fill-tertiary xl:col-span-4" />
      </div>
    </div>
  );
}
