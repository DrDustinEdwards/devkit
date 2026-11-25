import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, posix, relative, sep } from "node:path";
import { packageCopies } from "../copies.mjs";
import {
  DEFAULT_TOOLS,
  SIZE_CAP,
  globs,
  knipCounts,
  legacyCounts,
  percent,
  scan,
  testCases,
} from "./scan.mjs";
import { messageOf } from "./tools.mjs";

/** @typedef {import("./scan.mjs").Config} Config */
/** @typedef {import("./scan.mjs").Counts} Counts */
/** @typedef {import("./scan.mjs").Runner} Runner */
/** @typedef {import("./scan.mjs").Source} Source */

/**
 * The test files and cases, and the comment and code lines of the source, read from the files themselves.
 * @param {Config} config
 * @param {string[]} paths
 * @param {(path: string) => string} read
 */
export function countFiles(config, paths, read) {
  const { isTest, isSource } = globs(config);
  const tests = { files: 0, cases: 0 };
  /** @type {Record<string, number>} */
  const size = {};
  const cap = { ...SIZE_CAP, ...config.size };
  let lines = 0;
  let code = 0;
  for (const path of paths) {
    const isT = isTest(path);
    const test = config.tests !== false && isT;
    const source = config.comments !== false && isSource(path);
    const sized = config.size !== false && (isT || isSource(path));
    if (!test && !source && !sized) continue;
    const scanned = scan(read(path), path.endsWith(".css"));
    if (sized && scanned.kinds.length > (isT ? cap.test : cap.source))
      size[path] = scanned.kinds.length;
    if (test) {
      tests.files++;
      tests.cases += testCases(scanned.code);
    }
    if (source) {
      for (const kind of scanned.kinds) {
        if (kind === "code") code++;
        else if (kind === "comment") lines++;
      }
    }
  }
  /** @type {Counts} */
  const counts = {};
  if (config.size !== false) counts.size = size;
  if (config.tests !== false) counts.tests = tests;
  if (config.comments !== false)
    counts.comments = { lines, code, percentage: percent(lines, lines + code) };
  return counts;
}

/**
 * The source files jscpd skips, wherever they are: a path narrowed to today's files or directories, or a pattern, leaves
 * the next file outside it unread, and a copy there is never counted. A file shorter than jscpd's minLines (its lines as
 * jscpd counts them, newline-split) is left out, since it can hold no copy and jscpd skips it by design (one under its
 * minTokens is left out by measure, which asks jscpd); one longer than maxLines or larger than maxSize is not, since a
 * copy in it is never seen. Test files are left out (tests rise by design).
 * @param {Config} config @param {string[]} paths
 * @param {string[]} scanned the files jscpd read, from its report (measure)
 * @param {string} root
 * @param {(path: string) => string} [read] each file, to tell a short one
 * @param {number} [minLines] jscpd's minLines (jscpdOptions)
 * @returns {string[]}
 */
export function unreadFiles(config, paths, scanned, root, read = () => "", minLines = 0) {
  const { isTest, isSource } = globs(config);
  const norm = (/** @type {string} */ p) =>
    posix.normalize((isAbsolute(p) ? relative(root, p) : p).split(sep).join("/"));
  const seen = new Set(scanned.map(norm));
  return paths.filter(
    (p) => isSource(p) && !isTest(p) && !seen.has(p) && read(p).split("\n").length >= minLines,
  );
}

/**
 * Runs every tool the config names, counts the tests and comments, and returns the counts, keyed as the baseline is, and a
 * warning for each that could not run.
 * @param {Config} config
 * @param {Runner} run
 * @param {boolean} [jscpdConfigured] whether the repository has its own .jscpd.json, which then names the paths
 * @param {Source} [source] the repository's files
 * @param {{ root: string, packages: { repo: string, dir: string }[], missing: string[] }} [shared] the repository and the
 *   shared packages installed in it; `missing`, those its package.json names and node_modules lacks
 * @returns {{ counts: Counts, warnings: string[], copies: ReturnType<typeof packageCopies>, unread: string[] }}
 */
export function measure(
  config,
  run,
  jscpdConfigured = true,
  source = { list: () => [], read: () => "" },
  shared = { root: ".", packages: [], missing: [] },
) {
  /** @type {Counts} */
  const counts = {};
  const warnings = [];
  /** @type {ReturnType<typeof packageCopies>} */
  let copies = [];
  /** @type {string[]} */
  let unread = [];

  for (const { label, args = [] } of config.knip ?? [{ label: "knip" }]) {
    try {
      counts[label] = knipCounts(
        run("knip", [...args, "--no-exit-code", "--no-progress", "--reporter", "json"]),
      );
    } catch (error) {
      warnings.push(`${label} could not run: ${messageOf(error)}`);
    }
  }

  if (config.jscpd !== false) {
    const own = config.jscpd?.args ?? [];
    // jscpd with no path and no config of its own scans nothing; the repository root is the honest default.
    const paths = own.length === 0 && !jscpdConfigured ? ["."] : [];
    const out = mkdtempSync(join(tmpdir(), "jscpd-"));
    // jscpd 4 lists the files it read under each format; jscpd 5 lists none there, only in its summary, by absolute path.
    const major = Number(/@(\d+)\./.exec(config.tools?.jscpd ?? DEFAULT_TOOLS.jscpd)?.[1] ?? 0);
    const listed = major >= 5 ? ["--summary", "--summary-top", "1000000000"] : [];
    try {
      run("jscpd", [
        ...own,
        ...paths,
        ...listed,
        "--absolute",
        "--reporters",
        "json",
        "--output",
        out,
        "--silent",
      ]);
      const report = JSON.parse(readFileSync(join(out, "jscpd-report.json"), "utf8"));
      const total = report.statistics.total;
      if (!total.sources) throw new Error("it read no files; check its paths, format and ignore");
      /** @type {string[]} */
      const scanned =
        major >= 5
          ? (report.summary?.files ?? []).map((/** @type {{ path: string }} */ f) => f.path)
          : Object.values(report.statistics.formats ?? {}).flatMap(
              (/** @type {{ sources?: object }} */ f) => Object.keys(f.sources ?? {}),
            );
      if (scanned.length !== total.sources)
        throw new Error(
          `its report lists ${scanned.length} files it read, not the ${total.sources} it counted, so the files it skips cannot be told`,
        );
      const options = jscpdOptions(jscpdFile(source), config);
      unread = unreadFiles(
        config,
        source.list(),
        scanned,
        shared.root,
        source.read,
        Number(options.minLines),
      );
      // A file under jscpd's minTokens can hold no copy either. jscpd itself says which: it reads the files it skipped,
      // with only its thresholds and mode (an empty config of its own), and what it still skips is too small.
      if (unread.length) {
        const probe = join(out, "probe");
        writeFileSync(join(out, "empty.json"), "{}");
        run("jscpd", [
          ...unread.map((p) => join(shared.root, p)),
          ...listed,
          "--config",
          join(out, "empty.json"),
          "--min-lines",
          String(options.minLines),
          "--min-tokens",
          String(options.minTokens),
          "--mode",
          String(options.mode),
          "--absolute",
          "--reporters",
          "json",
          "--output",
          probe,
          "--silent",
        ]);
        let read = /** @type {string[]} */ ([]);
        try {
          const r = JSON.parse(readFileSync(join(probe, "jscpd-report.json"), "utf8"));
          read =
            major >= 5
              ? (r.summary?.files ?? []).map((/** @type {{ path: string }} */ f) => f.path)
              : Object.values(r.statistics.formats ?? {}).flatMap(
                  (/** @type {{ sources?: object }} */ f) => Object.keys(f.sources ?? {}),
                );
        } catch {
          // No report: it read none of them, so every one is too small to hold a copy.
        }
        const big = new Set(
          read.map((p) => posix.normalize(relative(shared.root, p).split(sep).join("/"))),
        );
        unread = unread.filter((p) => big.has(p));
      }
      counts.jscpd = {
        clones: total.clones,
        lines: total.duplicatedLines,
        percentage: Number(Number(total.percentage).toFixed(2)),
        unread: unread.length,
      };
    } catch (error) {
      warnings.push(`jscpd could not run: ${messageOf(error)}`);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }

  if (config.shared !== false) {
    try {
      // A package the repository depends on and has not installed would be a count over less than it copies from.
      if (shared.missing.length)
        throw new Error(`${shared.missing.join(", ")} not installed; run the install first`);
      copies = packageCopies(shared.root, source.list(), shared.packages, (args) => {
        run("jscpd", args);
      });
      counts["shared copies"] = {
        clones: copies.length,
        lines: copies.reduce((n, [a]) => n + a.end - a.start + 1, 0),
      };
    } catch (error) {
      warnings.push(`the shared copies could not be counted: ${messageOf(error)}`);
    }
  }

  if (config.legacy !== false) {
    try {
      counts.legacy = legacyCounts(
        run("modern-web-guidance", ["legacy-scan", ...(config.legacy?.args ?? ["."]), "--json"]),
        source.read,
      );
    } catch (error) {
      warnings.push(`legacy-scan could not run: ${messageOf(error)}`);
    }
  }

  if (config.tests !== false || config.comments !== false) {
    try {
      Object.assign(counts, countFiles(config, source.list(), source.read));
    } catch (error) {
      warnings.push(`tests and comments could not be counted: ${messageOf(error)}`);
    }
  }

  return { counts, warnings, copies, unread };
}

/** The repository's .jscpd.json, parsed, or null. */
function jscpdFile(/** @type {Source} */ source) {
  try {
    return JSON.parse(source.read(JSCPD_CONFIG));
  } catch {
    return null;
  }
}

export const JSCPD_CONFIG = ".jscpd.json";

/**
 * The options jscpd counts with, from .jscpd.json and the config's args (which win, as on jscpd's command line), and
 * `path`, the directories and files it reads: the args' positional ones, else the file's, else the root.
 */
function jscpdOptions(/** @type {unknown} */ file, /** @type {Config | null} */ config) {
  const args = config?.jscpd && typeof config.jscpd === "object" ? (config.jscpd.args ?? []) : [];
  /** @type {Record<string, unknown>} */
  const opts = { ...JSCPD_DEFAULTS, ...(file && typeof file === "object" ? file : {}) };
  /** @type {string[]} */
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const [flag, inline] = args[i].includes("=") ? args[i].split(/=(.*)/s) : [args[i], undefined];
    const key = JSCPD_FLAGS[flag];
    if (key) opts[key] = inline ?? args[++i];
    else if (JSCPD_SWITCHES[flag]) opts[JSCPD_SWITCHES[flag]] = true;
    else if (JSCPD_VALUED.has(flag) && inline === undefined) i++;
    else if (!flag.startsWith("-")) positional.push(flag);
  }
  if (positional.length) opts.path = positional;
  const paths = Array.isArray(opts.path) ? opts.path : opts.path ? [opts.path] : ["."];
  opts.path = paths.map((p) => posix.normalize(String(p).split(sep).join("/")).replace(/\/$/, ""));
  return opts;
}

/** jscpd's other flags that take a value, so the value is not read as a path. */
const JSCPD_VALUED = new Set([
  "--ignore",
  "-i",
  "--ignore-pattern",
  "--reporters",
  "-r",
  "--output",
  "-o",
  "--threshold",
  "-t",
  "--store",
  "--exitCode",
]);

const JSCPD_DEFAULTS = {
  minLines: 5,
  minTokens: 50,
  maxLines: 1000,
  maxSize: "100kb",
  mode: "mild",
};

/** @type {Record<string, string>} */
const JSCPD_FLAGS = {
  "--min-lines": "minLines",
  "-l": "minLines",
  "--min-tokens": "minTokens",
  "-k": "minTokens",
  "--max-lines": "maxLines",
  "-x": "maxLines",
  "--max-size": "maxSize",
  "-z": "maxSize",
  "--format": "format",
  "-f": "format",
  "--mode": "mode",
  "-m": "mode",
  "--pattern": "pattern",
  "-p": "pattern",
  "--formats-exts": "formatsExts",
  "--config": "config",
  "-c": "config",
};

/** @type {Record<string, string>} */
const JSCPD_SWITCHES = {
  "--gitignore": "gitignore",
  "-g": "gitignore",
  "--skipLocal": "skipLocal",
  "--noSymlinks": "noSymlinks",
  "-n": "noSymlinks",
};

/** A jscpd size ("100kb", "1mb", 2048) in bytes. */
function bytes(/** @type {unknown} */ size) {
  const m = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i.exec(String(size).trim());
  if (!m) return NaN;
  return Number(m[1]) * 1024 ** ["b", "kb", "mb", "gb"].indexOf((m[2] ?? "b").toLowerCase());
}

/**
 * The ways a change narrows what jscpd counts as a copy, so that nothing it reads now drops but the next change's copy is
 * missed: a larger minimum or a smaller maximum, fewer formats, another mode than strict, a file pattern, an extension map
 * or a config path changed, gitignore, skipLocal or noSymlinks turned on, or a path that no longer covers one it read
 * (a narrowing to today's file list); a new file it then skips is unreadAdded's. And a knip run whose arguments change, since the no-bloat config is strict JSON and cannot say why.
 * Pure.
 * @param {{ before: (path: string) => string | null, now: (path: string) => string | null }} change
 * @param {Config} config @param {Config | null} base
 */
export function narrowed(change, config, base) {
  const json = (/** @type {string | null} */ t) => (t === null ? null : JSON.parse(t));
  const was = jscpdOptions(json(change.before(JSCPD_CONFIG)), base);
  const is = jscpdOptions(json(change.now(JSCPD_CONFIG)), config);
  const formats = (/** @type {unknown} */ f) =>
    f === undefined
      ? null
      : (Array.isArray(f) ? f : String(f).split(",")).map((x) => String(x).trim());
  /** @type {string[]} */
  const why = [];
  const show = (/** @type {unknown} */ v) => JSON.stringify(v ?? null);
  for (const key of ["minLines", "minTokens"])
    if (Number(is[key]) > Number(was[key])) why.push(`${key} from ${was[key]} to ${is[key]}`);
  if (Number(is.maxLines) < Number(was.maxLines))
    why.push(`maxLines from ${was.maxLines} to ${is.maxLines}`);
  if (!(bytes(is.maxSize) >= bytes(was.maxSize)))
    why.push(`maxSize from ${was.maxSize} to ${is.maxSize}`);
  const [f0, f1] = [formats(was.format), formats(is.format)];
  if (f1 && (!f0 || f0.some((f) => !f1.includes(f))))
    why.push(`format from ${f0 ? f0.join(",") : "every format"} to ${f1.join(",")}`);
  if (is.mode !== was.mode && is.mode !== "strict") why.push(`mode from ${was.mode} to ${is.mode}`);
  for (const key of ["pattern", "formatsExts", "config"])
    if (show(is[key]) !== show(was[key]))
      why.push(`${key} from ${show(was[key])} to ${show(is[key])}`);
  for (const key of ["gitignore", "skipLocal", "noSymlinks"])
    if (is[key] === true && was[key] !== true) why.push(`${key} turned on`);
  // A path may widen, never drop what it read: each old one stays, or a directory above it is read.
  const covers = (/** @type {string} */ wide, /** @type {string} */ p) =>
    wide === "." || wide === p || p.startsWith(`${wide}/`);
  const [p0, p1] = [/** @type {string[]} */ (was.path), /** @type {string[]} */ (is.path)];
  const dropped = p0.filter((p) => !p1.some((w) => covers(w, p)));
  if (dropped.length)
    why.push(`path from ${show(p0)} to ${show(p1)}, which no longer reads ${dropped.join(", ")}`);
  const out = why.map(
    (w) =>
      `this change narrows what jscpd counts as a copy (${w}), so a copy it misses from now on is never counted. Leave it as it was; a real exception is marked in the source with \`jscpd:ignore-start\` and its reason.`,
  );
  for (const run of config.knip ?? []) {
    const old = (base?.knip ?? []).find((r) => r.label === run.label);
    if (old && show(old.args ?? []) !== show(run.args ?? []))
      out.push(
        `the knip run "${run.label}" changes its args from ${show(old.args ?? [])} to ${show(run.args ?? [])}, and the no-bloat config is strict JSON, so it cannot say why. Put the change in the Knip config with a comment, or add a run.`,
      );
  }
  return out;
}
