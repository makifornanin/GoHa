import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * The mobile contract for text-entry controls.
 *
 * Two rules that no other gate can see. jsdom does no layout and evaluates no
 * media query, so typecheck, lint and every rendering test stay green while a
 * phone gets a 32px field that zooms the viewport on tap. This asserts on the
 * classes because the classes ARE the behaviour here, and because both rules
 * look like stray magic numbers to anyone tidying up later:
 *
 *  - 44px minimum tap target (design spec section 7).
 *  - 16px minimum font size. Below that, iOS Safari zooms the page when the
 *    field takes focus. `--text-body` is 14px, so every field in GoHa was
 *    jumping the viewport until this was pinned.
 *
 * Both revert at `sm:` to the documented desktop density, which is why the
 * desktop overrides are asserted too: dropping them would silently make the
 * whole desktop UI phone-sized.
 */
describe("mobile form controls", () => {
  it("gives Input a 44px target and a non-zooming font on phones", () => {
    render(<Input aria-label="field" />);
    const cls = screen.getByLabelText("field").className;
    expect(cls).toContain("h-11");
    expect(cls).toContain("text-[16px]");
    expect(cls).toContain("sm:h-8");
    expect(cls).toContain("sm:text-body");
  });

  it("gives Textarea a non-zooming font on phones", () => {
    render(<Textarea aria-label="notes" />);
    const cls = screen.getByLabelText("notes").className;
    expect(cls).toContain("text-[16px]");
    expect(cls).toContain("sm:text-body");
  });

  it("keeps the date-input styling that Input applies only to date types", () => {
    // Guards against a refactor that reorders the cn() arguments and drops the
    // conditional block along with the size classes.
    render(<Input aria-label="when" type="date" />);
    expect(screen.getByLabelText("when").className).toContain("webkit-datetime-edit");
  });
});
