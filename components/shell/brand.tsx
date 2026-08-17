import { cn } from "@/lib/utils";

/**
 * The GoHa wordmark.
 *
 * There used to be a blue tile with a "G" in it, which is what every
 * dashboard's logo slot looks like and said nothing about this app. With the
 * tile gone the name has to carry the identity by itself, so it is set rather
 * than merely printed:
 *
 *  - The two syllables of the name are the two halves of what it does, Goals
 *    and Habits, so they are weighted differently. "Go" is semibold in the
 *    label colour, "Ha" is regular in the secondary colour. One word, with a
 *    hinge in the middle.
 *  - Negative tracking pulls the four letters into a single shape at this size;
 *    at 17px, default tracking reads as four separate letters.
 *  - A single blue dot follows the name. It is the one piece of colour in the
 *    chrome, it echoes the accent used for "an action you can take", and it
 *    gives the mark an asymmetric anchor so it does not float.
 *
 * Deliberately not: an icon, a gradient, a monogram, or a glyph in a rounded
 * square. The design language here is Apple HIG, where a wordmark earns its
 * place through weight, spacing and optical alignment.
 */
export function Brand({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col justify-center leading-none", className)}>
      <p className="flex items-baseline text-[19px] leading-[24px] tracking-[-0.03em]">
        <span className="font-semibold text-label">Go</span>
        <span className="font-normal text-label-secondary">Ha</span>
        <span
          aria-hidden
          className="ml-1 size-[5px] shrink-0 self-center rounded-full bg-blue"
        />
      </p>
      <p className="mt-1 text-[11px] leading-[14px] font-medium uppercase tracking-[0.08em] text-label-tertiary">
        Life Operating System
      </p>
    </div>
  );
}
