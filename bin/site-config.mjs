// Reading a bin's JSON config: `--config <file>` or a default name in the working directory. A missing or unreadable file
// exits 1 with an `::error::` line, since a gate that read no config must not pass.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { escapeAnnotation } from "./annotate.mjs";

/**
 * The parsed config and the path it came from.
 * @param {string[]} argv
 * @param {string} defaultName
 * @param {string} label the bin's name in messages
 * @returns {{ config: Record<string, any>, path: string }}
 */
export function readConfig(argv, defaultName, label) {
  const i = argv.indexOf("--config");
  const path = resolve(i >= 0 ? (argv[i + 1] ?? "") : defaultName);
  /** @param {string} m @returns {never} */
  const fail = (m) => {
    console.error(`::error::${label}: ${escapeAnnotation(m)}`);
    process.exit(1);
  };
  if (!existsSync(path)) fail(`no config at ${path}`);
  try {
    const config = JSON.parse(readFileSync(path, "utf8"));
    if (config === null || typeof config !== "object" || Array.isArray(config))
      fail(`${path} is not a JSON object`);
    return { config, path };
  } catch (e) {
    return fail(`${path} is not JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
}
