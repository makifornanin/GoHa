/** Content-shaped skeleton while the server aggregates today's data. Finite and calm. */
export default function TodayLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-8" aria-hidden>
      {/* Greeting */}
      <div className="space-y-2">
        <div className="h-7 w-64 max-w-full rounded-md bg-gray-5" />
        <div className="h-4 w-44 rounded-sm bg-gray-5" />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
        {/* Main column */}
        <div className="flex flex-col gap-6 md:col-span-8">
          {/* Focus card */}
          <div className="rounded-2xl border border-separator-opaque bg-surface p-5 shadow-e1">
            <div className="h-3 w-24 rounded-sm bg-gray-5" />
            <div className="mt-4 h-5 w-2/3 rounded-md bg-gray-5" />
            <div className="mt-2 h-3 w-40 rounded-sm bg-gray-5" />
            <div className="mt-5 flex gap-2">
              <div className="h-10 w-44 rounded-xl bg-gray-5" />
              <div className="h-8 w-24 rounded-lg bg-gray-5" />
            </div>
          </div>

          {/* Two list cards with 40px rows */}
          {[0, 1].map((i) => (
            <div key={i} className="rounded-2xl border border-separator-opaque bg-surface shadow-e1">
              <div className="flex items-center justify-between px-4 pt-4">
                <div className="h-4 w-28 rounded-sm bg-gray-5" />
                <div className="h-3 w-8 rounded-sm bg-gray-5" />
              </div>
              <div className="px-1 pb-2 pt-3">
                {Array.from({ length: 3 }, (_, r) => (
                  <div key={r} className="flex h-10 items-center gap-3 px-3">
                    <div className="size-5 rounded-full bg-gray-5" />
                    <div className="h-3.5 flex-1 rounded-sm bg-gray-5" />
                    <div className="h-4 w-12 rounded-sm bg-gray-5" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Right rail */}
        <div className="flex flex-col gap-6 md:col-span-4">
          <div className="flex items-center gap-4 rounded-2xl border border-separator-opaque bg-surface p-4 shadow-e1">
            <div className="size-20 shrink-0 rounded-full bg-gray-5" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-28 rounded-sm bg-gray-5" />
              <div className="h-3 w-24 rounded-sm bg-gray-5" />
            </div>
          </div>
          {[0, 1].map((i) => (
            <div key={i} className="rounded-2xl border border-separator-opaque bg-surface p-4 shadow-e1">
              <div className="mb-4 h-4 w-24 rounded-sm bg-gray-5" />
              <div className="space-y-4">
                {Array.from({ length: 3 }, (_, r) => (
                  <div key={r} className="space-y-1.5">
                    <div className="h-3.5 w-full rounded-sm bg-gray-5" />
                    <div className="h-1 w-full rounded-full bg-gray-5" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
