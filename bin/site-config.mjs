// Reading a bin's JSON config: `--config <file>` or a default name in the working directory. A missing or unreadable file
// exits 1 with an `::error::` line, since a gate that read no config must not pass.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { fail } from "./annotate.mjs";

/**
 * The parsed config and the path it came from.
 * @param {string[]} argv
 * @param {string} defaultName
 * @param {string} label the bin's name in messages
 * @param {{ optional?: boolean }} [options] `optional`: a missing file is an empty config, not an error (a gate whose
 *   baseline is not written yet); a file that is there must still parse
 * @returns {{ config: Record<string, any>, path: string }}
 */
export function readConfig(argv, defaultName, label, { optional = false } = {}) {
  const i = argv.indexOf("--config");
  const path = resolve(i >= 0 ? (argv[i + 1] ?? "") : defaultName);
  if (!existsSync(path)) {
    if (optional) return { config: {}, path };
    fail(label, `no config at ${path}`);
  }
  try {
    const config = JSON.parse(readFileSync(path, "utf8"));
    if (config === null || typeof config !== "object" || Array.isArray(config))
      fail(label, `${path} is not a JSON object`);
    return { config, path };
  } catch (e) {
    return fail(label, `${path} is not JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * The config's `minimum_checks`, the floor a gate's check count must reach so a run that examined nothing cannot pass.
 * @param {string} label the bin's name in messages
 * @param {Record<string, any>} config
 * @returns {number}
 */
export function minimumChecks(label, config) {
  const minimum = Number(config.minimum_checks);
  if (!Number.isInteger(minimum) || minimum < 1)
    fail(label, '"minimum_checks" must be a positive integer');
  return minimum;
}
