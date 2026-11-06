// The shared Oxlint config: three plain config objects a repository's oxlint.config.ts extends.
//
//   import { defineConfig } from "oxlint";
//   import { base, react, node } from "@dustinedwards/devkit/oxlint";
//
//   export default defineConfig({
//     extends: [base, react],
//     overrides: [{ files: ["scripts/**", "bin/**", "test/**"], ...node }],
//   });
//
// Oxlint's docs name this as the way to share a config from a package: "Use `oxlint.config.ts` when extending config
// objects imported from a shared package. Package imports are not supported in the `.oxlintrc.json` format."
// (https://oxc.rs/docs/guide/usage/linter/config.html#extend-shared-configs). Configs merge first to last, so a
// repository's own `rules` after `extends` win. The objects import nothing from `oxlint`, so devkit needs no runtime
// dependency; `oxlint` and `oxlint-tsgolint` are peer dependencies at the versions this file is tested with
// (test/oxlint.test.mjs). Run with `oxlint --type-aware`: the type-aware rules are silent without it.

/**
 * Every repository. Oxlint's correctness category, plus the rules the network's linters were set up for: a dropped
 * promise loses its rejection and in a Worker can outlive the request, so `no-floating-promises` and
 * `no-misused-promises` (Cloudflare's Workers best practices,
 * https://developers.cloudflare.com/workers/best-practices/workers-best-practices/), and the three Biome rules astro
 * and foxing hold (`noExplicitAny`, `noNonNullAssertion`, `useConst`).
 *
 * The type-aware correctness rules stay on, with four exceptions decided once here for every repository. They were
 * eight local offs in dustinedwards-info's .oxlintrc.json, with no reason recorded; a run of all eight over
 * dustinedwards-info and site-api (2026-11-06) decided which:
 * - Off: `no-base-to-string` (75 findings), `restrict-template-expressions` (24), `unbound-method` (25) and
 *   `require-array-sort-compare` (11). Every finding read was a value the checker could not narrow in checked
 *   JavaScript (a string array built from a Set, a `String(v)` of a parsed field, a method read as a boolean), not a
 *   bug, so the rules would be fixed by casts, not by better code.
 * - On: `await-thenable`, `no-misused-spread`, `no-duplicate-type-constituents` and `no-useless-default-assignment`
 *   (14 findings together): each flags code that is wrong or dead.
 * @type {import("oxlint").OxlintConfig}
 */
export const base = {
  plugins: ["typescript", "unicorn", "oxc", "import"],
  categories: { correctness: "error" },
  rules: {
    // node:test's `test`, `describe`, `it` and `suite` return a promise the runner itself awaits, so a test file's
    // top-level calls are not dropped promises (`allowForKnownSafeCalls`, the rule's option for such calls).
    "typescript/no-floating-promises": [
      "error",
      { allowForKnownSafeCalls: [{ from: "package", package: "node:test", name: ["test", "describe", "it", "suite"] }] },
    ],
    "typescript/no-misused-promises": "error",
    "typescript/no-explicit-any": "error",
    "typescript/no-non-null-assertion": "error",
    "eslint/prefer-const": "error",
    "typescript/no-base-to-string": "off",
    "typescript/restrict-template-expressions": "off",
    "typescript/unbound-method": "off",
    "typescript/require-array-sort-compare": "off",
  },
  ignorePatterns: ["build/", "dist/", ".react-router/", ".wrangler/", "worker-configuration.d.ts", "**/*.gen.ts"],
};

/**
 * A repository with React (React Router 8, Expo). The rules of hooks, exhaustive deps and Oxlint's native React
 * Compiler rules (react-hooks `recommended-latest` less `gating`, `config` and `component-hook-factories`, which check
 * the React Compiler's own options and no repository sets), at error. `only-export-components` keeps Fast Refresh
 * working and allows React Router's route module exports that are not components
 * (https://reactrouter.com/start/framework/route-module). `plugins` lists base's too, since a config that sets
 * `plugins` replaces the set it extends.
 * @type {import("oxlint").OxlintConfig}
 */
export const react = {
  plugins: ["typescript", "unicorn", "oxc", "import", "react", "jsx-a11y"],
  rules: {
    "react/rules-of-hooks": "error",
    "react/exhaustive-deps": "error",
    "react/purity": "error",
    "react/refs": "error",
    "react/immutability": "error",
    "react/globals": "error",
    "react/set-state-in-effect": "error",
    "react/set-state-in-render": "error",
    "react/static-components": "error",
    "react/use-memo": "error",
    "react/preserve-manual-memoization": "error",
    "react/error-boundaries": "error",
    "react/incompatible-library": "error",
    "react/unsupported-syntax": "error",
    "react/only-export-components": [
      "error",
      {
        allowExportNames: [
          "loader",
          "clientLoader",
          "action",
          "clientAction",
          "middleware",
          "clientMiddleware",
          "meta",
          "links",
          "headers",
          "handle",
          "shouldRevalidate",
        ],
      },
    ],
  },
};

/**
 * Node's globals, for an override over `scripts/`, `bin/` and `test/`: `{ files: [...], ...node }`.
 * @type {{ env: import("oxlint").OxlintEnv }}
 */
export const node = {
  env: { node: true },
};
