// devkit lints itself with the config it ships (lint/oxlint.mjs), as a repository that installs it does. The fixture
// that must fail is test/oxlint.test.mjs's to run.
import { defineConfig } from "oxlint";
import { base, node } from "./lint/oxlint.mjs";

export default defineConfig({
  extends: [base],
  ignorePatterns: ["test/fixtures/oxlint/"],
  overrides: [{ files: ["bin/**", "scripts/**", "test/**", "testing/**", "drill/**", "vite/**", "*.mjs"], ...node }],
});
