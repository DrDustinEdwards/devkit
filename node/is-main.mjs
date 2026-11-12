// Whether a module is the script Node was started with, the guard that lets a bin export its functions for tests and
// still run when invoked.

import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * True when `importMetaUrl` (the caller's `import.meta.url`) is the entry script. The script path goes through
 * `realpathSync`, so a bin reached by a symlink (`node_modules/.bin`) still matches.
 *
 * @param {string} importMetaUrl
 * @returns {boolean}
 */
export function isMain(importMetaUrl) {
  return (
    Boolean(process.argv[1]) && importMetaUrl === pathToFileURL(realpathSync(process.argv[1])).href
  );
}
