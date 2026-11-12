// The one escape for text printed into a GitHub workflow command (`::error::`, `::warning::`, `::notice::`). A file name,
// a remote /health value, a tool's stderr or a baseline key can carry a newline, and a line starting `::` would then be a
// command of the attacker's choosing (`::set-output`, `::stop-commands::`). `%`, CR and LF are what the runner decodes. Also here: `fail`, the error-and-exit every check ends a bad run with, and
// `shortHead`, the commit stamp a baseline records.

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

/** `text` safe to print after `::<command> <props>::`. */
export function escapeAnnotation(/** @type {unknown} */ text) {
  return String(text).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

/** `text` safe in a command's `title=` property, where `:` and `,` also end the value. */
export function escapeProperty(/** @type {unknown} */ text) {
  return escapeAnnotation(text).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

/**
 * Prints `::error::<prefix>: <message>` and exits 1: how a check stops on a problem it cannot go on past.
 * @param {string} prefix
 * @param {unknown} message
 * @returns {never}
 */
export function fail(prefix, message) {
  console.log(`::error::${escapeAnnotation(`${prefix}: ${message}`)}`);
  process.exit(1);
}

/** The short commit id of HEAD in `root`, or today's date (YYYY-MM-DD) where git cannot say. */
export function shortHead(/** @type {string} */ root) {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** Adds `text` and a newline to the workflow run's step summary; nothing outside GitHub Actions. */
export function appendSummary(/** @type {string} */ text) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
}
