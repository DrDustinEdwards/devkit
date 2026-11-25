import { posix } from "node:path";
import { NOT_SOURCE, SOURCE, blankComments, excused, mcpServerDirs } from "./core.mjs";

/** @typedef {import("./core.mjs").Config} Config */
/** @typedef {import("./core.mjs").Finding} Finding */
/** @typedef {import("./core.mjs").Tree} Tree */

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

/** A model call in a file: the markers C6 needs before it reads a regex as cutting JSON out of a model's answer. */
const MODEL_CALL =
  /\bAI\s*\.\s*run\s*\(|\.(?:chatCompletions|aiSearch)\s*\(|["'`]@dustinedwards\/site-runtime\/anthropic["'`]|["'`]@anthropic-ai\/sdk["'`]/;

/** A timeout within reach of a call that cannot take one through the shared caller. */
const TIMEOUT = /AbortSignal\.timeout\(|\bsignal\s*:|\bsetTimeout\(|Promise\.race\(/;

/** site-runtime's `withTimeout`: a call to it counts as a timeout only in a file that imports it from there. */
const WITH_TIMEOUT = /\bwithTimeout\(/;

const TIME_IMPORT = /["'`]@dustinedwards\/site-runtime\/time["'`]/;

/**
 * The AI rules: each a pattern over a source file's code (comments blanked), what it means, and the checklist item it
 * proves. `test`, when given, judges the match (the call's arguments, the code around it) and returns what is missing, or
 * null when the call is fine. Every rule was run against the network's repositories before it was added; none flags code
 * that already does it the shared way.
 * @type {{ id: string, find: RegExp, self?: string, test?: (code: string, m: RegExpExecArray) => string | null, say: (missing: string) => string }[]}
 */
const AI_RULES = [
  // Anthropic's Messages API called by hand or through the SDK, not through the shared caller (which adds the gateway,
  // the timeout, the one retry layer and the stop-reason check). The routines URL is the R2 rule's, not this one's.
  {
    id: "C1",
    self: "site-runtime",
    find: /["'`]@anthropic-ai\/sdk["'`]|\bnew\s+Anthropic\s*\(|api\.anthropic\.com\/v1\/messages|["'`]\/v1\/messages["'`]/,
    say: () =>
      "calls Anthropic's Messages API outside site-runtime ./anthropic (C1, G1): use messages, structured or stream, which add the gateway, the timeout and the one retry layer",
  },
  // A Workers AI run: it needs a deadline (`signal`), the site's gateway and a cap on the answer.
  {
    id: "C2",
    find: /\bAI\s*\.\s*run\s*\(/g,
    test: (code, m) => {
      const args = callArguments(code, m.index + m[0].length - 1);
      const missing = [
        ["signal", "a timeout (signal: AbortSignal.timeout(ms), C2)"],
        ["gateway", "the gateway (gateway: { id, metadata }, G1)"],
        ["max_tokens", "max_tokens (C5)"],
      ]
        .filter(([key]) => !new RegExp(`\\b${key}\\b`).test(args))
        .map(([, what]) => what);
      return missing.length ? missing.join(", ") : null;
    },
    say: (missing) =>
      `runs Workers AI without ${missing}: a person waits on it and the gateway is where its cost shows (C13)`,
  },
  // AI Search's model calls, the answer and the reranker: the binding takes no signal, so the deadline is the caller's.
  {
    id: "C13",
    find: /\.(?:chatCompletions|aiSearch)\s*\(|\breranking\s*:\s*\{\s*enabled\s*:\s*true/g,
    test: (code, m) => {
      const near = code.slice(Math.max(0, m.index - 1500), m.index + 800);
      return TIMEOUT.test(near) || (WITH_TIMEOUT.test(near) && TIME_IMPORT.test(code))
        ? null
        : "a timeout";
    },
    say: () =>
      "calls an AI Search model (an answer or the reranker) with no timeout near it (C2, C13): wrap it in site-runtime's withTimeout (./time) or race it against a deadline",
  },
  // JSON cut out of free text with a greedy regex, in a file that calls a model: ask for structured output instead.
  {
    id: "C6",
    find: /\/\\[{[]\[\\s\\S\]\*\??\\[}\]]\//,
    test: (code) => (MODEL_CALL.test(code) ? "" : null),
    say: () =>
      "cuts JSON out of a model's free text with a regex (C6): ask for structured output (site-runtime ./anthropic structured, or Workers AI's response_format) and parse the answer whole",
  },
  // A prompt's own rule about dashes: WRITING_RULES already says it, so a second copy drifts from it.
  {
    id: "W5",
    self: "site-runtime",
    find: /["'`][^"'`\n]*?\b(?:do not use|don['’]t use|never use|avoid|no)\s+(?:any\s+)?(?:em|en|long)(?:\s+or\s+en)?[ -]?dash/i,
    say: () =>
      "writes its own dash rule into a prompt (W5): site-runtime ./prose WRITING_RULES says it; put WRITING_RULES in the prompt instead of local style text",
  },
  // fireRoutine on its own: a retry after an unanswered fire starts a second session.
  {
    id: "R2",
    self: "site-runtime",
    find: /(?:import|export)\s*(?:type\s*)?\{[^}]*\bfireRoutine\b[^}]*\}\s*from\s*["'`]@dustinedwards\/site-runtime\/routine["'`]/,
    say: () =>
      "fires a routine with fireRoutine, outside the duplicate guard (R2): use fireOnce from site-runtime ./routine with an atomic store (D1 or a Durable Object), so a retry never starts a second session",
  },
];

/** The text between a call's parentheses, from the index of its "(" (at most 4,000 characters). */
function callArguments(/** @type {string} */ code, /** @type {number} */ open) {
  let depth = 0;
  for (let i = open; i < Math.min(code.length, open + 4000); i++) {
    if ("([{".includes(code[i])) depth++;
    else if (")]}".includes(code[i]) && --depth === 0) return code.slice(open + 1, i);
  }
  return code.slice(open + 1, open + 4000);
}

/**
 * Model calls and prompts that skip the shared pieces (AI_RULES), in source outside tests. A file the repository keeps
 * on purpose is excused in .shared.json "copies", with the reason.
 * @param {Tree} tree @param {Config} config @param {string} [self]
 * @returns {Finding[]}
 */
export function checkAi(tree, config, self) {
  /** @type {Finding[]} */
  const found = [];
  for (const file of tree.files) {
    if (!SOURCE.test(file) || NOT_SOURCE.test(file)) continue;
    const text = tree.read(file);
    if (
      !/\bAI\b|anthropic|chatCompletions|aiSearch|reranking|dash|fireRoutine|\{\[\\s\\S\]|\[\[\\s\\S\]/i.test(
        text,
      )
    )
      continue;
    const code = blankComments(text);
    /** @type {Finding[]} */
    const mine = [];
    for (const rule of AI_RULES) {
      if (rule.self && rule.self === self) continue;
      const find = rule.find.global
        ? rule.find
        : new RegExp(rule.find.source, `${rule.find.flags}g`);
      for (const m of code.matchAll(find)) {
        const missing = rule.test ? rule.test(code, m) : "";
        if (missing === null) continue;
        mine.push({
          check: "ai",
          file,
          line: code.slice(0, m.index).split("\n").length,
          message: `[${rule.id}] this ${rule.say(missing)}`,
        });
        if (!rule.find.global) break;
      }
    }
    if (mine.length && !excused(config, "copies", file)) found.push(...mine);
  }
  return found;
}
