import type { OxlintConfig, OxlintEnv } from "oxlint";

/**
 * Every repository: Oxlint's correctness category with the typescript, unicorn, oxc and import plugins;
 * `no-floating-promises` (node:test's `test`, `describe`, `it` and `suite` allowed), `no-misused-promises`,
 * `no-explicit-any` and `prefer-const` at error; `no-base-to-string`,
 * `restrict-template-expressions`, `unbound-method` and `require-array-sort-compare` off. Lint with `oxlint --type-aware`.
 */
export const base: OxlintConfig;

/**
 * A repository with React: base's plugins plus react and jsx-a11y; the rules of hooks, exhaustive deps and the native
 * React Compiler rules at error.
 */
export const react: OxlintConfig;

/** Node's globals, spread into an override: `{ files: ["scripts/**", "bin/**", "test/**"], ...node }`. */
export const node: { env: OxlintEnv };

/** Build output, `.react-router/`, `.wrangler/`, `worker-configuration.d.ts` and `*.gen.ts`: the config's own `ignorePatterns`, since Oxlint does not carry it through `extends`. */
export const ignorePatterns: string[];
