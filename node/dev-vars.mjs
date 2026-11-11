// Reads one secret from a repository's `.dev.vars` (from dustinedwards.info's scripts/lib/dev-vars.mjs). Returns one
// value by name, never the file or a map, and never logs a value.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * @param {string} name
 * @param {{ root?: string }} [options] the repository root holding `.dev.vars` (default the working directory)
 * @returns {string | null} its value, or null when the file or the key is absent
 */
export function readDevVar(name, options = {}) {
  const path = join(options.root ?? process.cwd(), ".dev.vars");
  if (!existsSync(path)) return null;

  // Anchored to line start: unanchored, a longer name ending in this one would return the wrong credential.
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = readFileSync(path, "utf8").match(
    new RegExp(`^[ \\t]*${escaped}[ \\t]*=[ \\t]*(.*)$`, "m"),
  );
  if (!match) return null;

  // A `#` inside quotes is part of the value, so trailing comments are stripped only when unquoted.
  let value = match[1].trim();
  const quoted = /^(["'])(.*)\1$/.exec(value);
  if (quoted) return quoted[2];
  value = value.replace(/\s+#.*$/, "").trim();
  return value.length > 0 ? value : null;
}
