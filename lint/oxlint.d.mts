import type { OxlintConfig, OxlintEnv } from "oxlint";

/**
 * Every repository: Oxlint's correctness category with the typescript, unicorn, oxc and import plugins;
 * `no-floating-promises` (node:test's `test`, `describe`, `it` and `suite` allowed), `no-misused-promises`,
 * `no-explicit-any`, `no-non-null-assertion` and `prefer-const` at error; `no-base-to-string`,
 * `restrict-template-expressions`, `unbound-method` and `require-array-sort-compare` off; build output, `.react-router/`,
 * `.wrangler/`, `worker-configuration.d.ts` and `*.gen.ts` ignored. Lint with `oxlint --type-aware`.
 */
export const base: OxlintConfig;

/**
 * A repository with React: base's plugins plus react and jsx-a11y; the rules of hooks, exhaustive deps and the native
 * React Compiler rules at error; `only-export-components` allowing React Router's non-component route exports.
 */
export const react: OxlintConfig;

/** Node's globals, spread into an override: `{ files: ["scripts/**", "bin/**", "test/**"], ...node }`. */
export const node: { env: OxlintEnv };
