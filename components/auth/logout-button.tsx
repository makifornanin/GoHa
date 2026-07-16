"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

/**
 * Signs the user out via Better Auth, then sends them to the login screen.
 * Styled to match the sidebar's footer actions; pass `className` to override.
 */
export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await authClient.signOut({
          fetchOptions: {
            onSuccess: () => {
              router.replace("/login");
              router.refresh();
            },
            onError: (ctx) => {
              setPending(false);
              toast.error(ctx.error.message || "Could not sign out. Please try again.");
            },
          },
        });
      }}
      className={cn(
        "flex h-8 cursor-pointer items-center gap-2 rounded-md px-2.5 text-callout font-medium text-label-secondary transition-colors hover:bg-surface-hover hover:text-label disabled:pointer-events-none disabled:text-label-quaternary",
        className,
      )}
    >
      <LogOut className="size-5 shrink-0" aria-hidden />
      {pending ? "Signing out..." : "Logout"}
    </button>
  );
}
