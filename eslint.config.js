import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // ── Completely ignore generated / non-browser / standalone directories ─────────
  {
    ignores: [
      "dist",
      "build",
      "cache",
      "artifacts",
      "artifacts/**",
      "node_modules",
      // Mobile app is a standalone Expo React Native project
      "mobile/**",
      // Supabase edge functions run on Deno, not Node — @ts-nocheck is required
      "supabase/functions/**",
      // Hardhat / deployment scripts use CommonJS require() patterns
      "hardhat.config.js",
      "scripts/**",
      // Tailwind and PostCSS configs
      "tailwind.config.ts",
      "postcss.config.js",
    ],
  },

  // ── Main app source ─────────────────────────────────────────────────────────
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
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

      // Unused vars are off — TypeScript already catches real issues
      "@typescript-eslint/no-unused-vars": "off",

      // `any` is sometimes unavoidable when calling third-party JS APIs
      "@typescript-eslint/no-explicit-any": "warn",

      // Allow empty interfaces (used by Radix / shadcn/ui wrappers)
      "@typescript-eslint/no-empty-object-type": "off",

      // Allow empty catch blocks
      "no-empty": "off",

      // Allow @ts-ignore sparingly (but not @ts-nocheck on whole files)
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-ignore": "allow-with-description",
          "ts-expect-error": "allow-with-description",
          "ts-nocheck": true,
        },
      ],

      // Allow require() in .ts files that are evaluated by Node
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);
