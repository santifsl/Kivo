// Shared ESLint flat config. Packages without their own config use this one;
// apps/web extends it with the Next.js rules.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export const ignores = {
  ignores: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/.turbo/**", "**/next-env.d.ts"],
};

export const base = [
  ignores,
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
];

export default base;
