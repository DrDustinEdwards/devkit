// devkit formats itself with the config it ships (lint/oxfmt.mjs), as a repository that installs it does.
import { defineConfig } from "oxfmt";
import { format } from "./lint/oxfmt.mjs";

export default defineConfig({ ...format, ignorePatterns: [...(format.ignorePatterns ?? []), "test/fixtures/"] });
