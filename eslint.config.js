import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "supabase/functions/**/*.js"] },

  // Frontend React/TS — the code that ships to the browser and is typechecked
  // by the Vite build. Full strictness applies here.
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },

  // Vendored shadcn/ui primitives. These are generated library files that
  // intentionally re-export variants/hooks alongside components and use the
  // empty-interface pattern for prop passthrough — patterns the fast-refresh
  // and empty-object rules flag but that are correct here. Don't fight the
  // generator; scope those two rules off for this directory only.
  {
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },

  // Root tooling config (tailwind/vite/postcss/eslint). Node environment.
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["*.{ts,js}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.node,
    },
  },

  // Supabase edge functions run on Deno (not the browser) and exist to parse
  // dynamic external payloads — Anthropic tool results, Gmail/CRM/QuickBooks
  // REST responses, untyped `widget_data` JSON blobs. `any` is idiomatic at
  // those boundaries, and this code is deployed by Supabase, not compiled by
  // the frontend build. Give it the Deno environment and relax `no-explicit-any`
  // here, while keeping the genuinely useful rules (ban-ts-comment, no-empty).
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["supabase/functions/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.deno, EdgeRuntime: "readonly" },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
);
