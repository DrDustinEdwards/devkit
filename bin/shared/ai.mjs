import { SOURCE, NOT_SOURCE, excused } from "./config.mjs";
import { blankComments } from "./copies.mjs";
/** @import { Finding, Tree, Config } from "./config.mjs" */

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
 * null when the call is fine.
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
