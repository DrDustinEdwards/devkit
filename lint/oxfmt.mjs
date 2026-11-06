// The shared Oxfmt config: one plain config object a repository's oxfmt.config.ts spreads.
//
//   import { defineConfig } from "oxfmt";
//   import { format } from "@dustinedwards/devkit/oxfmt";
//
//   export default defineConfig({ ...format });
//
// Oxfmt is Oxlint's formatter (the same toolchain, Prettier's output: it is tested against Prettier's own test suite,
// https://oxc.rs/docs/guide/usage/formatter.html), chosen for every repository by Dustin on 2026-11-06. Its defaults are
// the network's style (2 spaces, double quotes, semicolons, trailing commas, width 100, which is also what astro's and
// foxing's Biome used), so nothing here restates a default; a repository adds only what its own files need (astro:
// `astro: true` with @astrojs/compiler-rs). `oxfmt` is an optional peer dependency at the version this file is tested
// with: it is pre-1.0, so a new release may move formatting, and Renovate's "Oxc" group bumps it everywhere at once.

/**
 * Every repository: Oxfmt's defaults, with build output, generated files and lockfiles left alone (`.no-bloat.json` is written by devkit-no-bloat; Oxfmt already
 * skips what .gitignore lists).
 * @type {import("oxfmt").OxfmtConfig}
 */
export const format = {
  ignorePatterns: [
    "build/",
    "dist/",
    ".react-router/",
    ".wrangler/",
    "worker-configuration.d.ts",
    "**/*.gen.ts",
    "package-lock.json",
  ],
};
