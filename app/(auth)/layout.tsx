export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      {/* Restrained ambient depth: one soft cyan glow and a faint technical grid. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-48 left-1/2 size-[40rem] -translate-x-1/2 rounded-full bg-primary/[0.08] blur-3xl"
      />
      <div
        aria-hidden
        className="grid-pattern pointer-events-none absolute inset-0 opacity-[0.035] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
      />
      <div className="relative w-full max-w-md">{children}</div>
    </div>
  );
}
