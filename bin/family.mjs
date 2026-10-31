#!/usr/bin/env node
// The shared-code check under its name before 0.20.8. An old family.yml (such as v0.18.0) checks out devkit's default
// branch and runs this path, so it stays until 0.21.0.
import { cli } from "./shared.mjs";

process.exitCode = await cli(process.argv.slice(2));
