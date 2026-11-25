import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DOCS, SIZE_CAP, globs, matches, scan } from "./scan.mjs";
import { BUFFER } from "./tools.mjs";

/** @typedef {import("./scan.mjs").Config} Config */
/** @typedef {import("./scan.mjs").Counts} Counts */

/**
 * One row per finding the baseline or the measurement names, an error for each that grew, a warning for a comment share that
 * rose past its tolerance (an error with `"fail": true`), and in `lowered` each gated count that went down, which main()
 * reports as a warning (a fall never fails). A finding with no baseline is a
 * row and never an error: there is nothing to have grown from. A baseline entry that no run in the config measures is stale.
 * @param {Record<string, unknown>} baseline
 * @param {Counts} counts
 * @param {Config} [config]
 */
export function compare(baseline, counts, config = {}) {
  /** @type {Array<[string, string, number | null, number]>} */
  const rows = [];
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];
  /** @type {string[]} */
  const lowered = [];
  /** @type {string[]} */
  const unmeasured = [];
  const knipRuns = config.knip ?? [{ label: "knip" }];
  const before = (/** @type {string} */ tool) =>
    /** @type {Record<string, number> | null} */ (tool in baseline ? baseline[tool] : null);
  /** A gated count: a row, an error when it grew, a warning when it went down. `zero` counts a key the baseline lacks from 0. */
  const gate = (
    /** @type {string} */ tool,
    /** @type {string} */ key,
    /** @type {string} */ name,
    /** @type {string} */ hint,
    zero = false,
  ) => {
    const old = before(tool);
    const was = old ? (old[key] ?? (zero ? 0 : null)) : null;
    const now = counts[tool][key] ?? 0;
    rows.push([tool, name, was, now]);
    if (was !== null && now > was)
      errors.push(`${tool}: ${name} went from ${was} to ${now}. ${hint}`);
    if (was !== null && now < was) lowered.push(`${tool}: ${name} ${was} to ${now}`);
  };

  // A count the baseline has no entry for would pass any number, so a measured tool missing from it is an error, not a
  // new row: dropping a tool's entry from the baseline must not turn its gate off.
  for (const tool of Object.keys(counts))
    if (!before(tool))
      unmeasured.push(
        `${tool}: the baseline has no count yet. Run \`npx devkit-no-bloat --write-baseline\` and commit the config.`,
      );

  for (const [tool, now] of Object.entries(counts)) {
    if (["jscpd", "shared copies", "legacy", "tests", "comments", "size"].includes(tool)) continue;
    const was = before(tool);
    const keys = [...new Set([...Object.keys(was ?? {}), ...Object.keys(now)])];
    // A clean run is a row too, so the table shows the tool ran.
    if (keys.length === 0) rows.push([tool, "findings", was ? 0 : null, 0]);
    const args = knipRuns.find((r) => r.label === tool)?.args ?? [];
    for (const key of keys)
      gate(
        tool,
        key,
        key,
        `Run \`npx knip${args.length ? ` ${args.join(" ")}` : ""}\` to see which.`,
        true,
      );
  }

  if (counts.jscpd) {
    gate("jscpd", "clones", "clones", "Run `npx jscpd` to see them.");
    gate("jscpd", "lines", "duplicated lines", "Run `npx jscpd` to see them.");
    if ("unread" in counts.jscpd)
      gate(
        "jscpd",
        "unread",
        "source files it skips",
        "A source file jscpd does not read can hold a copy nobody counts: widen jscpd's path in a change of its own, or move the file where it reads.",
        true,
      );
    rows.push([
      "jscpd",
      "duplicated lines % (not gated)",
      before("jscpd")?.percentage ?? null,
      counts.jscpd.percentage,
    ]);
  }

  if (counts.legacy) {
    const was = before("legacy");
    const keys = [...new Set([...Object.keys(was ?? {}), ...Object.keys(counts.legacy)])];
    if (keys.length === 0) rows.push(["legacy", "findings", was ? 0 : null, 0]);
    for (const key of keys)
      gate(
        "legacy",
        key,
        key,
        `Run \`npx modern-web-guidance@1.0.0 legacy-scan\` to see where, and \`npx modern-web-guidance@1.0.0 retrieve ${key}\` for the fix and when a match may stay.`,
        true,
      );
  }

  if (counts["shared copies"]) {
    const hint =
      "Each is a warning above with both places: import the shared one, delete the copy (SHARED.md).";
    gate("shared copies", "clones", "clones", hint);
    gate("shared copies", "lines", "copied lines", hint);
  }

  if (counts.size) {
    const cap = { ...SIZE_CAP, ...config.size };
    const hint = `A new file over ${cap.source} lines (${cap.test} for a test) fails, and so does a listed one that grew: split it by what it does. When one is cut, run \`npx devkit-no-bloat --write-baseline\` to lower its entry or drop it.`;
    const listed = Object.keys(before("size") ?? {});
    for (const key of new Set([...listed, ...Object.keys(counts.size)]))
      gate("size", key, key, hint, true);
  }

  if (counts.tests) {
    gate(
      "tests",
      "files",
      "test files",
      "A new test file is recorded with `npx devkit-no-bloat --write-baseline` in the same change.",
    );
    gate(
      "tests",
      "cases",
      "test cases",
      "A new test is recorded with `npx devkit-no-bloat --write-baseline` in the same change.",
    );
  }

  if (counts.comments) {
    const was = before("comments");
    const now = counts.comments;
    const tolerance = (config.comments || {}).tolerance ?? 1;
    rows.push(["comments", "comment lines", was?.lines ?? null, now.lines]);
    rows.push([
      "comments",
      `share of lines % (tolerance ${tolerance})`,
      was?.percentage ?? null,
      now.percentage,
    ]);
    const rise = was ? Math.round((now.percentage - was.percentage) * 100) : 0;
    if (was && rise > tolerance * 100 && now.lines > was.lines) {
      const finding = `comments: the share of source lines that are comments went from ${was.percentage}% to ${now.percentage}% (tolerance ${tolerance} points), comment lines from ${was.lines} to ${now.lines}. Remove comments that restate the code, or raise the baseline in a reviewed change.`;
      ((config.comments || {}).fail ? errors : warnings).push(finding);
    }
    if (was && -rise >= tolerance * 100)
      warnings.push(
        `comments: the share fell from ${was.percentage}% to ${now.percentage}%. Lower the baseline to keep it: run \`npx devkit-no-bloat --write-baseline\` and commit the config.`,
      );
  }

  const measured = new Set(["measured_at", ...knipRuns.map((r) => r.label)]);
  for (const tool of ["jscpd", "tests", "comments", "size"])
    if (config[/** @type {"jscpd"} */ (tool)] !== false) measured.add(tool);
  if (config.shared !== false) measured.add("shared copies");
  if (config.legacy !== false) measured.add("legacy");
  const stale = Object.keys(baseline)
    .filter((key) => !measured.has(key))
    .map(
      (key) =>
        `the baseline has "${key}", which no run in the config measures. Restore the run, or drop the entry with \`npx devkit-no-bloat --write-baseline\` in a reviewed change.`,
    );
  return { rows, errors, warnings, lowered, stale: [...unmeasured, ...stale] };
}

/**
 * The job summary table.
 * @param {Array<[string, string, number | null, number]>} rows
 * @param {string[]} problems the errors, then the warnings
 * @param {string | undefined} measuredAt
 */
export function render(rows, problems, measuredAt) {
  const show = (/** @type {number | null} */ n) => (n === null ? "none" : String(n));
  return [
    `### No-bloat ratchet (${measuredAt ? `baseline ${measuredAt}` : "no baseline yet: run `npx devkit-no-bloat --write-baseline`"})`,
    "",
    "| Tool | Finding | Baseline | Now |",
    "|---|---|---|---|",
    ...rows.map(
      ([tool, key, a, b]) =>
        `| ${tool} | ${key} | ${show(a)} | ${b}${a !== null && b > a ? " (up)" : ""} |`,
    ),
    "",
    problems.length ? problems.map((w) => `- ${w}`).join("\n") : "Nothing grew past the baseline.",
  ].join("\n");
}

const LINE_KINDS = /** @type {const} */ (["code", "tests", "comments", "docs", "other"]);

/**
 * The non-blank lines a `git diff -U0` adds and removes, by kind. A source file's lines are code, tests (in a test file) or
 * comments, as scan() reads the whole file on each side; `kindsAt` gives those, or null when it cannot.
 * @param {Config} config
 * @param {string} diff
 * @param {(side: "old" | "new", path: string) => Array<"code" | "comment" | "blank"> | null} kindsAt
 */
export function lineChanges(config, diff, kindsAt) {
  const totals = Object.fromEntries(LINE_KINDS.map((k) => [k, { added: 0, removed: 0 }]));
  const { isTest, isSource } = globs(config);
  const pathOf = (/** @type {string} */ raw) => {
    const p = raw.replace(/\t$/, "");
    if (p === "/dev/null") return null;
    return (p.startsWith('"') ? JSON.parse(p) : p).replace(/^[ab]\//, "");
  };
  let header = false;
  /** @type {string | null} */
  let oldPath = null;
  /** @type {{ test: boolean, source: boolean, docs: boolean, old: ReturnType<typeof kindsAt>, new: ReturnType<typeof kindsAt> }} */
  let file = { test: false, source: false, docs: false, old: null, new: null };
  let oldLine = 0;
  let newLine = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      header = true;
      oldPath = null;
      file = { test: false, source: false, docs: false, old: null, new: null };
    } else if (header && line.startsWith("--- ")) {
      oldPath = pathOf(line.slice(4));
    } else if (header && line.startsWith("+++ ")) {
      const newPath = pathOf(line.slice(4));
      const path = /** @type {string} */ (newPath ?? oldPath);
      const test = isTest(path);
      const source = test || isSource(path);
      file = { test, source, docs: !source && matches(path, DOCS), old: null, new: null };
      if (source) {
        file.old = oldPath ? kindsAt("old", oldPath) : null;
        file.new = newPath ? kindsAt("new", newPath) : null;
      }
    } else if (line.startsWith("@@")) {
      header = false;
      const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (m) [oldLine, newLine] = [Number(m[1]), Number(m[2])];
    } else if (!header && (line[0] === "+" || line[0] === "-")) {
      const added = line[0] === "+";
      const n = added ? newLine++ : oldLine++;
      const kinds = added ? file.new : file.old;
      const kind = file.source
        ? (kinds?.[n - 1] ?? (line.slice(1).trim() ? "code" : "blank"))
        : line.slice(1).trim()
          ? "text"
          : "blank";
      if (kind === "blank") continue;
      const into =
        kind === "comment"
          ? "comments"
          : file.source
            ? file.test
              ? "tests"
              : "code"
            : file.docs
              ? "docs"
              : "other";
      totals[into][added ? "added" : "removed"]++;
    }
  }
  return totals;
}

/** The lines summary for a pull request. */
export function renderLines(
  /** @type {ReturnType<typeof lineChanges>} */ totals,
  /** @type {string} */ base,
) {
  const signed = (/** @type {number} */ n) => (n > 0 ? `+${n}` : String(n));
  return [
    `### Lines added and removed (against ${base.slice(0, 7)}, blank lines not counted)`,
    "",
    "| Lines | Added | Removed | Net |",
    "|---|---|---|---|",
    ...Object.entries(totals).map(
      ([kind, { added, removed }]) =>
        `| ${kind} | ${added} | ${removed} | ${signed(added - removed)} |`,
    ),
  ].join("\n");
}

/** The repository's files as git lists them, tracked and untracked but not ignored. */
export function gitSource(/** @type {string} */ root) {
  return {
    list: () =>
      [
        ...new Set(
          execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
            cwd: root,
            encoding: "utf8",
            maxBuffer: BUFFER,
          }).split("\0"),
        ),
      ].filter((p) => p && existsSync(join(root, p)) && lstatSync(join(root, p)).isFile()),
    read: (/** @type {string} */ p) => readFileSync(join(root, p), "utf8"),
  };
}

/** Lines added and removed between the merge base of `from` and HEAD. */
export function gitLines(
  /** @type {string} */ root,
  /** @type {Config} */ config,
  /** @type {string} */ from,
) {
  const git = (/** @type {string[]} */ args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: BUFFER,
      stdio: ["ignore", "pipe", "pipe"],
    });
  const base = git(["merge-base", from, "HEAD"]).trim();
  const diff = git([
    "-c",
    "core.quotePath=false",
    "diff",
    "-U0",
    "--no-color",
    "--no-ext-diff",
    "-M",
    base,
    "HEAD",
  ]);
  const totals = lineChanges(config, diff, (side, path) => {
    try {
      return scan(git(["show", `${side === "old" ? base : "HEAD"}:${path}`]), path.endsWith(".css"))
        .kinds;
    } catch {
      return null;
    }
  });
  return renderLines(totals, base);
}
