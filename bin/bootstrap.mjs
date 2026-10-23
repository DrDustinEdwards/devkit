#!/usr/bin/env node
// The install step every Worker repository runs as its postinstall: copy each wrangler*.jsonc.example at the root to its
// real name once, never overwriting (a real config carrying live ids survives any number of reinstalls), then run
// `wrangler types`. Since wrangler 4.135.0, `wrangler types` on a terminal asks whether to update Cloudflare skills, and
// npm hides a lifecycle script's output, so the question is invisible and the install waits forever. Wrangler has no
// switch for it; it skips the prompt when stdin is not a terminal. So node starts wrangler directly with stdin detached,
// which behaves the same under cmd.exe, PowerShell and Linux CI.
//
//   devkit-bootstrap                         copy the examples, then wrangler types
//   devkit-bootstrap -- --strict-vars=false  arguments after -- go to wrangler types
//   devkit-bootstrap --types-only            wrangler types alone (a typecheck script)
//   devkit-bootstrap --check                 fail if a package.json script runs a bare `wrangler types`, which hangs
//
// WRANGLER_ENTRY stands a stub in for wrangler (the tests).

import { spawnSync } from "node:child_process";
import { constants, copyFileSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

/** The examples at `root` whose real file is missing, as [example, target]. */
export function missingConfigs(/** @type {string} */ root) {
  const names = readdirSync(root);
  return names
    .filter((n) => /^wrangler[\w.-]*\.jsonc\.example$/.test(n) && !names.includes(n.slice(0, -".example".length)))
    .map((n) => [n, n.slice(0, -".example".length)]);
}

/** The package.json scripts that run a bare `wrangler types`, as [name, command]. */
export function bareTypes(/** @type {Record<string, string>} */ scripts) {
  return Object.entries(scripts ?? {}).filter(([, command]) => /(^|[\s&|;])wrangler types\b/.test(String(command)));
}

function wranglerEntry(/** @type {string} */ root) {
  if (process.env.WRANGLER_ENTRY) return process.env.WRANGLER_ENTRY;
  // wrangler's "exports" hides bin/, so it is found through package.json's bin field.
  const pkgPath = createRequire(join(root, "package.json")).resolve("wrangler/package.json");
  const { bin } = JSON.parse(readFileSync(pkgPath, "utf8"));
  return join(dirname(pkgPath), typeof bin === "string" ? bin : bin.wrangler);
}

function main() {
  const root = process.cwd();
  const argv = process.argv.slice(2);
  const dash = argv.indexOf("--");
  const own = dash >= 0 ? argv.slice(0, dash) : argv;

  if (own.includes("--check")) {
    const bare = bareTypes(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts);
    for (const [name, command] of bare) console.error(`devkit-bootstrap: ${name} runs a bare \`wrangler types\` (${command}), which waits on a hidden prompt. Use devkit-bootstrap --types-only.`);
    process.exit(bare.length ? 1 : 0);
  }

  if (!own.includes("--types-only")) {
    for (const [example, target] of missingConfigs(root)) {
      try {
        copyFileSync(join(root, example), join(root, target), constants.COPYFILE_EXCL);
        console.log(`devkit-bootstrap: created ${target} from ${example}. Fill in its placeholders before deploying or running against real resources.`);
      } catch (error) {
        if (/** @type {NodeJS.ErrnoException} */ (error).code !== "EEXIST") throw error;
      }
    }
  }

  const result = spawnSync(process.execPath, [wranglerEntry(root), "types", ...(dash >= 0 ? argv.slice(dash + 1) : [])], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

// Run through node_modules/.bin, argv[1] is the link and import.meta.url the file it points to.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main();
