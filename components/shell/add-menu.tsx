"use client";

import { Brain, Flag, ListChecks, ListPlus, Plus, Repeat, Target } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Dropdown, type DropdownItem } from "@/components/ui/dropdown";
import {
  addHrefFor,
  addOptionsFor,
  type AddContext,
  type AddKind,
  type AddPrefill,
} from "@/lib/add-menu";
import { cn } from "@/lib/utils";

const ICON: Record<AddKind, LucideIcon> = {
  goal: Target,
  subgoal: Flag,
  todo: ListChecks,
  subtask: ListPlus,
  habit: Repeat,
  "brain-dump": Brain,
};

/**
 * The one create affordance in the app.
 *
 * It replaced a global "New Task" button, which was the wrong promise in two
 * ways: it named the lowest rung of the chain as the only thing worth starting,
 * and it was identical everywhere, so standing inside a goal bought you
 * nothing. This asks the context what can be created and hands the answer the
 * parents it already knows.
 *
 * A context with exactly one option renders as a plain labelled button rather
 * than a menu. Opening a menu to choose from one thing is a click spent on
 * nothing, and the label ("Add to-do") says more than "Add" plus a popup would.
 *
 * Keyboard support comes from `Dropdown`, which implements the WAI-ARIA
 * menu-button pattern in full: arrows, Home/End, type-ahead, Escape, and focus
 * returned to the trigger on close.
 */
export function AddMenu({
  context,
  goalId,
  lifeAreaId,
  parentGoalId,
  parentTaskId,
  /**
   * Handle a choice locally instead of navigating.
   *
   * Given when the current screen can already open the right form. Navigating
   * from a goal to `/goals?new=1&parentGoalId=...` would re-render the board
   * behind a modal and lose the reader's place, so the goal page opens its own.
   * Anything without a handler falls through to the prefilled link.
   */
  onAddSubgoal,
  onAddGoal,
  onAddTodo,
  variant = "secondary",
  size = "sm",
  align = "end",
  side = "bottom",
  label = "Add",
  /**
   * Render as a bare "+" with no visible text.
   *
   * For dense rows (a life area card's action cluster) where a labelled button
   * would dominate the card. The accessible name is supplied explicitly, so the
   * control is still announced: an icon button with no name is an unusable
   * control, not a tidy one.
   */
  iconOnly = false,
  iconLabel = "Add",
  className,
}: {
  context: AddContext;
  onAddSubgoal?: () => void;
  onAddGoal?: () => void;
  onAddTodo?: () => void;
  variant?: "default" | "secondary" | "ghost";
  size?: "sm" | "default";
  align?: "start" | "end";
  side?: "bottom" | "top";
  label?: string;
  iconOnly?: boolean;
  iconLabel?: string;
  className?: string;
} & AddPrefill) {
  const router = useRouter();
  const prefill: AddPrefill = { goalId, lifeAreaId, parentGoalId, parentTaskId };
  const options = addOptionsFor(context);

  const handlers: Partial<Record<AddKind, (() => void) | undefined>> = {
    subgoal: onAddSubgoal,
    goal: onAddGoal,
    todo: onAddTodo,
  };

  const run = (kind: AddKind) => {
    const local = handlers[kind];
    if (local) local();
    else router.push(addHrefFor(kind, prefill));
  };

  if (options.length === 1) {
    const only = options[0];
    const Icon = ICON[only.kind];
    return (
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => run(only.kind)}
        data-testid="add-menu-single"
        {...(iconOnly ? { "aria-label": `Add ${only.label.toLowerCase()}` } : {})}
      >
        <Icon aria-hidden />
        {iconOnly ? null : `Add ${only.label.toLowerCase()}`}
      </Button>
    );
  }

  const items: DropdownItem[] = options.map((option) => ({
    label: option.label,
    icon: ICON[option.kind],
    onSelect: () => run(option.kind),
  }));

  return (
    <Dropdown
      align={align}
      side={side}
      menuLabel="Create"
      className={className}
      items={items}
      trigger={
        <Button
          variant={variant}
          size={size}
          data-testid="add-menu"
          {...(iconOnly ? { "aria-label": iconLabel } : {})}
        >
          <Plus aria-hidden />
          {iconOnly ? null : label}
        </Button>
      }
    />
  );
}

/**
 * The mobile tab bar's centre action.
 *
 * Same menu, different body: a 48px blue circle that overlaps the bar, so it
 * cannot reuse the `Button` chrome. It also has to open UPWARD, since a bar
 * sitting on the home indicator has no room beneath it.
 */
export function AddMenuFab({ className }: { className?: string }) {
  const router = useRouter();
  const items: DropdownItem[] = addOptionsFor("root").map((option) => ({
    label: option.label,
    icon: ICON[option.kind],
    onSelect: () => router.push(addHrefFor(option.kind)),
  }));

  return (
    <Dropdown
      align="end"
      side="top"
      menuLabel="Create"
      className={className}
      items={items}
      trigger={
        <button
          type="button"
          aria-label="Add"
          data-testid="add-menu-fab"
          className={cn(
            "-mt-6 flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-full bg-blue text-white shadow-e2 transition-transform active:scale-[0.96]",
            "focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40",
          )}
        >
          <Plus className="size-6" aria-hidden />
        </button>
      }
    />
  );
}
