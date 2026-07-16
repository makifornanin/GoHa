export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Login is a cinematic screen (spec section 10): one message, generous
  // negative space, nothing else. The canvas is plain; restraint IS the design.
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
