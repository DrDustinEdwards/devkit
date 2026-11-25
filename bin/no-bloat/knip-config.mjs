import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import { blankComments } from "../shared/copies.mjs";
import { BUFFER, cleanEnv } from "./tools.mjs";

/** A Knip plugin config in code, which Knip runs in its own process, and the extensions its local imports resolve to. */
export const CODE_CONFIG = /\.(?:[cm]?[jt]sx?)$/;

const IMPORT_EXTS = [".ts", ".mts", ".cts", ".tsx", ".js", ".mjs", ".cjs", ".jsx", ".json"];

/**
 * The repository's files that a Knip plugin reads as its config (`patterns`, Knip's own list at the tool's version,
 * checkTools knipConfigs), at the root or in a workspace, and the local modules a config in code imports, followed
 * through literal relative specifiers. Knip imports a config in code (.mocharc.cjs, vite.config.ts), so one can print a
 * report of its own or patch Knip; a config in data (tsconfig.json, .mocharc.json) can make any file an entry, whose
 * exports Knip then never reports. Either is a change of how Knip counts. package.json and the workflows are judged on
 * their own (classify). An import stops at a code file of the repository's own Knip project (`counted`, the `entry` and
 * `project` globs of its Knip config, knipCounted): Knip reads that file as code like any other, whatever imports it, so
 * a config importing it changes nothing about how it is counted, and a site's Vite config that renders pages from the
 * components and its own render modules (Capsomer's docs site) does not make them configs. A data file it reaches
 * (.json) is still followed, and a code file outside the project, which Knip never reads as code, is still a config's.
 * A config in code in `settled` is left out with what it imports: Knip counts no less from it now than at the base
 * (settledConfigs), so its body changed what the config does, not what Knip counts. Pure.
 * @param {string[]} paths @param {string[]} patterns @param {(path: string) => string} read
 * @param {string[]} [counted] @param {string[]} [settled]
 */
export function knipPluginFiles(paths, patterns, read, counted = [], settled = []) {
  const own = patterns.filter((g) => !g.startsWith("package.") && !g.startsWith(".github/"));
  const isConfig = (/** @type {string} */ p) =>
    !settled.includes(p) &&
    own.some((g) => posix.matchesGlob(p, g) || posix.matchesGlob(p, `**/${g}`));
  const files = new Set(paths);
  const out = new Set(paths.filter(isConfig));
  const queue = [...out].filter((p) => CODE_CONFIG.test(p));
  while (queue.length) {
    const p = /** @type {string} */ (queue.pop());
    let text = "";
    try {
      text = read(p);
    } catch {
      continue;
    }
    for (const m of text.matchAll(
      /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["'`](\.{1,2}\/[^"'`]+)["'`]/g,
    )) {
      const to = posix.normalize(posix.join(posix.dirname(p), m[1]));
      const bare = to.replace(/\.[cm]?jsx?$/, "");
      const hit = [
        to,
        ...IMPORT_EXTS.map((e) => bare + e),
        ...IMPORT_EXTS.map((e) => `${to}/index${e}`),
      ].find((c) => files.has(c));
      if (
        hit &&
        !out.has(hit) &&
        !(CODE_CONFIG.test(hit) && counted.some((g) => posix.matchesGlob(hit, g)))
      ) {
        out.add(hit);
        if (CODE_CONFIG.test(hit)) queue.push(hit);
      }
    }
  }
  return [...out];
}

/**
 * The inputs Knip takes from each plugin config, by the config's path, read from `knip --debug`, which lists every input
 * with the file it came from (`'entry:src/vite-env.d.ts (site/vite.config.ts)'`), each list sorted. A config Knip loads
 * and takes nothing from has no key. Pure.
 * @param {string} debug @returns {Record<string, string[]>}
 */
export function knipConfigInputs(debug) {
  /** @type {Record<string, string[]>} */
  const out = {};
  // oxlint-disable-next-line no-control-regex -- the color codes Knip may print around each string
  const plain = debug.replace(/\u001b\[[0-9;]*m/g, "");
  for (const m of plain.matchAll(/'([A-Za-z]+:[^'\n]*?) \(([^'()\n]+)\)'/g))
    (out[m[2]] ??= []).push(m[1]);
  for (const list of Object.values(out)) list.sort();
  return out;
}

/**
 * Whether Knip counts no less from a config now than at the base: every input it takes now it took at the base too. An
 * entry naming a file the repository does not have at that side (a page the build writes, which is not in git) reads
 * nothing and is left out, at the base against `filesBefore` and now against `filesNow`; a relative entry is read from
 * the config's folder and from the root. Dropping an input is a stricter count, as dropping an entry from knip.json is
 * (onlyDropsEntries). A script a page among the config's inputs loads (`pageScripts`, an HTML file's `<script src>`, as
 * Knip's Vite plugin reads it) is that page's code, as an import is, so it may be new. Pure.
 * @param {string} config @param {string[]} before @param {string[]} now
 * @param {string[]} filesBefore @param {string[]} filesNow @param {string[]} [pageScripts]
 */
export function inputsNarrowed(config, before, now, filesBefore, filesNow, pageScripts = []) {
  const real = (/** @type {string[]} */ list, /** @type {Set<string>} */ files) =>
    list.filter((input) => {
      const [type, spec] = [
        input.slice(0, input.indexOf(":")),
        input.slice(input.indexOf(":") + 1),
      ];
      if (!/entry/i.test(type) || /[*?{[(!$]/.test(spec)) return true;
      return [spec, posix.join(posix.dirname(config), spec)].some((p) =>
        files.has(posix.normalize(p)),
      );
    });
  const was = new Set(real(before, new Set(filesBefore)));
  return real(now, new Set(filesNow)).every(
    (input) => was.has(input) || pageScripts.includes(input.slice(input.indexOf(":") + 1)),
  );
}

/**
 * The scripts the HTML pages among a config's inputs load, by repository path: each `<script src>` that is not a URL,
 * read from the folder of its page. A page the build writes is read where it is now. `read` is null for a page that
 * is not there. Pure.
 * @param {string[]} inputs @param {(path: string) => string | null} read @returns {string[]}
 */
export function pageScripts(inputs, read) {
  return inputs.flatMap((input) => {
    const page = posix.normalize(input.slice(input.indexOf(":") + 1));
    const html = page.endsWith(".html") ? read(page) : null;
    if (html === null) return [];
    return [...html.matchAll(/<script\b[^>]*?\ssrc=["']([^"']+)["']/gi)]
      .map((m) => m[1])
      .filter((src) => !/^[a-z]+:|^\/\//i.test(src))
      .map((src) =>
        posix.normalize(src.startsWith("/") ? src.slice(1) : posix.join(posix.dirname(page), src)),
      );
  });
}

/**
 * The configs in code among `roots` that Knip counts no less from now than at `base`, for every Knip run
 * (inputsNarrowed): a change to such a config's body, or to what it imports, changes what the config does, not what Knip
 * counts. The base is checked out on its own, beside this checkout's node_modules, and read by the same Knip. When
 * either side cannot be read, none is settled and every change to a config stays a change of measure. Knip runs a config
 * in code to read it, so a config could still patch Knip itself; the counts the run reports are the guard there.
 * @param {string} root @param {string} base a commit @param {string[]} roots @param {string[]} files now
 * @param {(args: string[], cwd?: string) => string} knip @param {string[][]} runs each Knip run's own arguments
 * @returns {string[]}
 */
export function settledConfigs(root, base, roots, files, knip, runs) {
  if (!roots.length) return [];
  const git = (/** @type {string[]} */ args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: BUFFER,
      stdio: ["ignore", "pipe", "pipe"],
    });
  const dir = mkdtempSync(join(tmpdir(), "no-bloat-base-"));
  try {
    git(["worktree", "add", "--detach", "--quiet", dir, base]);
    // The base reads its config against the base's own packages: a change that removes one a config imports would otherwise
    // leave the base unreadable, and none settled. With the same lockfile, this checkout's node_modules is the base's.
    const lock = "package-lock.json";
    if (
      existsSync(join(dir, lock)) &&
      (!existsSync(join(root, lock)) ||
        readFileSync(join(dir, lock), "utf8") !== readFileSync(join(root, lock), "utf8"))
    )
      execFileSync("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], {
        cwd: dir,
        stdio: "ignore",
        maxBuffer: BUFFER,
        env: cleanEnv(process.env),
      });
    else if (existsSync(join(root, "node_modules")))
      symlinkSync(join(root, "node_modules"), join(dir, "node_modules"), "dir");
    const filesBefore = git(["ls-tree", "-r", "-z", "--name-only", base]).split("\0");
    const debug = ["--debug", "--no-exit-code", "--no-progress", "--no-config-hints"];
    const same = new Set(roots);
    for (const args of runs) {
      const [was, is] = [dir, root].map((cwd) => knipConfigInputs(knip([...args, ...debug], cwd)));
      for (const r of roots)
        if (
          !inputsNarrowed(
            r,
            was[r] ?? [],
            is[r] ?? [],
            filesBefore,
            files,
            pageScripts(is[r] ?? [], (p) =>
              existsSync(join(root, p)) ? readFileSync(join(root, p), "utf8") : null,
            ),
          )
        )
          same.delete(r);
    }
    return [...same];
  } catch {
    return [];
  } finally {
    try {
      git(["worktree", "remove", "--force", dir]);
    } catch {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

/** Knip's default `project`: every source file it reads as code (knip.dev, "Configuration"). */
const KNIP_PROJECT = "**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}";

/**
 * The repository's Knip config in data (knip.json or knip.jsonc), parsed as Knip reads it (JSONC), read with `read`:
 * undefined when there is none, null when it does not parse. Pure.
 * @param {(path: string) => string | null} read @returns {any}
 */
function knipData(read) {
  for (const path of ["knip.json", "knip.jsonc", ".knip.json", ".knip.jsonc"]) {
    const text = read(path);
    if (text === null || text === undefined) continue;
    try {
      return JSON.parse(blankComments(text).replace(/,(\s*[\]}])/g, "$1"));
    } catch {
      return null;
    }
  }
  return undefined;
}

/** A Knip config's `entry` or `project` globs, at the root and in each workspace with its directory in front. */
const knipGlobs = (/** @type {any} */ config, /** @type {"entry" | "project"} */ key) => {
  const list = (/** @type {string | string[] | undefined} */ e) =>
    e === undefined ? [] : [e].flat();
  return [
    ...list(config?.[key]),
    ...Object.entries(config?.workspaces ?? {}).flatMap(([dir, w]) =>
      list(/** @type {any} */ (w)?.[key]).map((g) => posix.join(dir, g)),
    ),
  ];
};

/**
 * The files the repository's Knip config in data reads as its own code: its `entry` and `project` globs (root and
 * workspaces), or Knip's default project when it names none or there is no such config; none when it does not parse.
 * Negated globs are left out. Pure.
 * @param {(path: string) => string | null} read @returns {string[]}
 */
export function knipCounted(read) {
  const config = knipData(read);
  if (config === null) return [];
  const project = knipGlobs(config, "project");
  return [...knipGlobs(config, "entry"), ...(project.length ? project : [KNIP_PROJECT])].filter(
    (g) => !g.startsWith("!"),
  );
}

/**
 * How a change to a Knip config in data moves its `entry` globs (root or workspace), when it moves nothing else:
 * `dropped`, the globs it no longer has, and `added`, the ones it gains. Null when the config changes in any other way or
 * either side does not parse. Pure.
 * @param {string | null} before @param {string | null} now
 * @returns {{ dropped: string[], added: string[] } | null}
 */
function entryChange(before, now) {
  const [a, b] = [knipData(() => before), knipData(() => now)];
  if (!a || !b) return null;
  const rest = (/** @type {any} */ c) =>
    JSON.stringify({
      ...c,
      entry: undefined,
      ignoreDependencies: undefined,
      workspaces: Object.fromEntries(
        Object.entries(c.workspaces ?? {}).map(([k, w]) => [
          k,
          { .../** @type {any} */ (w), entry: undefined },
        ]),
      ),
    });
  if (rest(a) !== rest(b)) return null;
  const [was, is] = [a, b].map((c) => [...knipGlobs(c, "entry"), ...(c.ignoreDependencies ?? [])]);
  return { dropped: was.filter((g) => !is.includes(g)), added: is.filter((g) => !was.includes(g)) };
}

/**
 * Whether a change to a Knip config in data only drops `entry` globs that are not negations. Knip then reads fewer files
 * as entries, so it reports more, never less: a stricter count, not a change of measure. Pure.
 * @param {string | null} before @param {string | null} now
 */
export function onlyDropsEntries(before, now) {
  const moved = entryChange(before, now);
  return Boolean(moved && !moved.added.length && moved.dropped.every((g) => !g.startsWith("!")));
}

/**
 * The `entry` globs a change to a Knip config in data adds, when it changes nothing else and adds no negation; none
 * otherwise. Such a change is a change of measure: Knip reads the files the globs name as entries, and follows their
 * imports, so it reads more, but no longer counts those files as unused (raised allows that drop and no other). Pure.
 * @param {string | null} before @param {string | null} now
 */
export function addedEntries(before, now) {
  const moved = entryChange(before, now);
  return moved && !moved.dropped.length && moved.added.every((g) => !g.startsWith("!"))
    ? moved.added
    : [];
}
