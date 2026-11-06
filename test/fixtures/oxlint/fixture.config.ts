// test/oxlint.test.mjs's config (passed with -c). It extends the shared one by its package name, as a repository's does, and adds a restricted
// import the way txasm's boundary will.
import { defineConfig } from "oxlint";
import { base, react } from "@dustinedwards/devkit/oxlint";

export default defineConfig({
  extends: [base, react],
  rules: {
    "eslint/no-restricted-imports": ["error", { patterns: [{ group: ["**/secret"], message: "Only the boundary imports the secret." }] }],
  },
});
