import { posix } from "node:path";
import { SOURCE, NOT_SOURCE, excused } from "./config.mjs";
import { mcpServerDirs } from "./pins.mjs";
import { blankComments } from "./copies.mjs";
/** @import { Finding, Tree, Config } from "./config.mjs" */

/**
 * The agent jobs, each with its one owner (an agent tool lives in one place, never a per-site copy). A
 * site's MCP server that serves a tool for one of these is a second owner, so the check fails it, whatever the tool is
 * called and however its code is written: a tool is read by its name, its title and the operator call or API path it
 * makes, so a renamed copy (dei_sync_files titled "Back up the files now", calling "backup_media") is still found. The
 * jobs that are not agent tools are listed in SHARED.md with the check that holds them (email, the Claude Code hooks,
 * the nightly dump). `failsFrom` lets a site move first: the rule warns until that devkit release.
 */
export const JOBS = [
  {
    job: "backups",
    owner: "Capsid Admin",
    repo: "capsid",
    words: /\bback ?ups?\b/,
    use: "capsid_admin_run_controls control site_backup, and capsid_admin_read_ops action backups",
    failsFrom: "0.28.0",
  },
  {
    job: "media",
    owner: "Carrel",
    repo: "carrel",
    words: /\b(?:media|images?|photos?|uploads?)\b/,
    use: "carrel_import_media and carrel_delete_media",
    failsFrom: "0.28.0",
  },
  {
    job: "writing",
    owner: "Carrel",
    repo: "carrel",
    words: /\b(?:posts?|drafts?|pages?|articles?)\b/,
    use: "carrel_save_draft, carrel_preview_item and carrel_publish_item",
  },
  {
    job: "webmentions",
    owner: "Carrel",
    repo: "carrel",
    words: /\b(?:web ?)?mentions?\b/,
    use: "Carrel's mention moderation over site-api's mentions group",
    failsFrom: "0.28.0",
  },
  {
    job: "site checks and drift repair",
    owner: "Capsid Admin",
    repo: "capsid",
    words: /\bdrift\b|\brepairs?\b|\bcheck (?:the )?site\b/,
    use: "capsid_admin_run_controls control site_repair",
    failsFrom: "0.28.0",
  },
];
/** The jobs another check holds, for the table in SHARED.md. */
export const OTHER_JOBS = [
  {
    job: "email",
    owner: "site-runtime",
    use: "site-runtime ./email: an app with a send_email binding that sends without it fails (features)",
  },
  {
    job: "Claude Code hooks",
    owner: "devkit",
    use: "devkit claude/hooks, run from .claude/settings.json: a repository's own copy fails (copies)",
  },
  {
    job: "the nightly dump",
    owner: "d1-dump",
    use: "d1-dump runCheckedBackup and backupHealth in the app's cron: an app with D1 and no dump fails (features)",
  },
];

/** A source file that serves MCP through the shared admin door, beside the MCP_SERVER files. */
const ADMIN_MCP = /["']@dustinedwards\/site-runtime\/admin-mcp["']/;
/** A tool's name where a tool list defines it: name: "site_verb_noun". */
const TOOL_NAME = /^[ \t]*(?:\{[ \t]*)?name\s*:\s*["'`]([a-z][a-z0-9]*_[a-z0-9_]+)["'`]/gm;

/** A tool's text as the job words read it: words split on underscores, dashes, slashes and case, lowercase. */
const words = (/** @type {string} */ s) =>
  ` ${s
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;

/**
 * The tools a definition block names and does: its name (less the site prefix), its title, and the operator tools and API
 * paths its handler calls. Pure.
 * @param {string} block the text from one tool's name: to the next
 */
function toolText(block) {
  const name = /["'`]([a-z0-9_]+)["'`]/.exec(block)?.[1] ?? "";
  const title = /\btitle\s*:\s*["'`]([^"'`]+)["'`]/.exec(block)?.[1] ?? "";
  // What it calls: a path ("/backup/media") or an operator tool name ("backup_media") in a string, never prose.
  const calls = [...block.matchAll(/["'`](\/[a-z0-9_/-]+|[a-z]+(?:_[a-z0-9]+)+)["'`]/g)]
    .map((m) => m[1])
    .filter((s) => s !== name);
  return { name, text: words([name.split("_").slice(1).join("_"), title, ...calls].join(" ")) };
}

/**
 * Tools a repository's MCP servers serve for a job another owner holds (JOBS).
 * @param {Tree} tree @param {Config} config @param {string} [repo] the repository's own name (its root package.json's)
 * @returns {Finding[]}
 */
export function checkJobs(tree, config, repo) {
  /** @type {Finding[]} */
  const found = [];
  const servers = new Set(mcpServerDirs(tree));
  const manifests = tree.files
    .filter((f) => posix.basename(f) === "package.json" && !NOT_SOURCE.test(f))
    .map((f) => posix.dirname(f));
  for (const file of tree.files) {
    if (!SOURCE.test(file) || NOT_SOURCE.test(file) || !ADMIN_MCP.test(tree.read(file))) continue;
    const dir = manifests
      .filter((d) => d === "." || file.startsWith(`${d}/`))
      .sort((a, b) => b.length - a.length)[0];
    if (dir) servers.add(dir);
  }
  for (const file of tree.files) {
    if (
      !SOURCE.test(file) ||
      NOT_SOURCE.test(file) ||
      ![...servers].some((d) => d === "." || file.startsWith(`${d}/`))
    )
      continue;
    const code = blankComments(tree.read(file));
    const starts = [...code.matchAll(TOOL_NAME)].map((m) => m.index);
    starts.forEach((start, i) => {
      const { name, text } = toolText(code.slice(start, starts[i + 1] ?? start + 4000));
      const job = JOBS.find((j) => j.words.test(text));
      if (!job || job.repo === repo || excused(config, "copies", `${file}#${name}`)) return;
      found.push({
        check: "jobs",
        file,
        line: code.slice(0, start).split("\n").length,
        failsFrom: job.failsFrom,
        message: `${name} serves ${job.job}, which ${job.owner} owns: delete it and use ${job.use} (SHARED.md, "Agent jobs")`,
      });
    });
  }
  return found;
}
