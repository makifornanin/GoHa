import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    /*
     * Guards for the mistakes this codebase has actually made twice.
     *
     * Deliberately a restricted-syntax rule rather than a custom plugin: these
     * are single JSX attributes, so the AST check is short and obvious, and a
     * plugin would be more machinery than the problem deserves.
     *
     * The shape-of-the-rendered-page problems (contrast, hit areas) are NOT
     * here. Lint cannot see computed styles, so guessing at them produces a
     * brittle rule; those are handled by fixing the shared primitives and by
     * measuring in a real browser instead.
     */
    files: ["app/**/*.tsx", "components/**/*.tsx"],
    ignores: ["components/ui/date-field.tsx", "components/ui/time-field.tsx", "components/ui/input.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            'JSXAttribute[name.name="type"][value.value=/^(date|datetime-local)$/]',
          message:
            "Use <DateField> instead of a native date input: it keeps GoHa's styling and resolves the local date from the saved timezone.",
        },
        {
          selector: 'JSXAttribute[name.name="type"][value.value="time"]',
          message:
            "Use <TimeField> instead of a native time input. Daily Rhythm is a real clock setting and still uses TimeField.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
