"use client";

import { Focus, Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { ThemeToggle } from "./theme-toggle";

/** Desktop top toolbar: `glass-thin` chrome (spec section 5). */
export function AppHeader({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <header
      className={cn(
        "glass-thin sticky top-0 z-30 h-14 items-center justify-end gap-2 border-0 border-b border-b-glass-border px-6",
        className,
      )}
    >
      <Button variant="secondary" onClick={() => router.push("/focus")}>
        <Focus />
        <span className="hidden lg:inline">Focus Mode</span>
      </Button>
      {/* `?new=1` opens the create form on arrival: this button promises a form,
          so it must deliver one rather than just navigating. */}
      <Button onClick={() => router.push("/tasks?new=1")}>
        <Plus />
        <span className="hidden sm:inline">Add Task</span>
      </Button>

      <div className="mx-2 h-5 w-px bg-separator" />

      <ThemeToggle />
    </header>
  );
}
