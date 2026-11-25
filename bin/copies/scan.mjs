import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

const BUFFER = 256 * 1024 * 1024;

/** The files that count as source: code and styles, the formats a copy would be moved into a shared package from. */
const SOURCE = /\.(?:[cm]?[jt]sx?|css|py|sh|sql)$/;

/**
 * What the scan leaves out: tests, builds, generated and vendored code; a site's database migrations, which are its applied
 * history and can never be edited or removed, so a ratchet over them could never go down; and the dot-folders other than
 * .claude and .github (.vscode, .wrangler...), editor and tool state. .claude and .github are read: their hooks and
 * scripts are code, and ten byte-identical .claude/hooks copies went unseen while every dot-folder was skipped.
 */
const SKIP =
  /(?:^|\/)(?:\.(?!(?:claude|github)\/)[^/]+|node_modules|vendor|third_party|dist|build|out|coverage|test|tests|__tests__|__mocks__|e2e|fixtures?|generated|drizzle|migrations)\/|\.(?:test|spec)\.[^/]+$|\.min\.[^/]+$|\.d\.[cm]?ts$/;

/** Whether a tracked path is source the scan reads. */
const isSource = (/** @type {string} */ path) => SOURCE.test(path) && !SKIP.test(path);

/**
 * The .claude files jscpd does not read (agents, skills, commands, rules: Markdown and the like), compared whole instead.
 * The settings files are left out: .claude/settings.json is each repository's own permissions plus the hook block devkit's
 * README has every repository paste, so the same bytes there are the shared way, not a copy.
 */
const isWholeFile = (/** @type {string} */ path) =>
  /(?:^|\/)\.claude\//.test(path) &&
  !SOURCE.test(path) &&
  !SKIP.test(path) &&
  !/(?:^|\/)settings(?:\.local)?\.json$/.test(path);

/**
 * Files with the same bytes in more than one repository: each group of places that hold one content. Pure.
 * @param {{ repo: string, path: string, hash: string }[]} files
 */
export function sameFiles(files) {
  /** @type {Map<string, { repo: string, path: string }[]>} */
  const byHash = new Map();
  for (const { repo, path, hash } of files)
    byHash.set(hash, [...(byHash.get(hash) ?? []), { repo, path }]);
  return [...byHash.values()]
    .filter((places) => new Set(places.map((p) => p.repo)).size > 1)
    .map((places) =>
      places.sort((a, b) => `${a.repo}/${a.path}`.localeCompare(`${b.repo}/${b.path}`)),
    )
    .sort((a, b) => `${a[0].repo}/${a[0].path}`.localeCompare(`${b[0].repo}/${b[0].path}`));
}

/**
 * The copied blocks whose two files sit in different repositories, from jscpd's JSON report over a folder laid out as
 * <repo>/<path>. Pure.
 * @param {{ duplicates: { firstFile: { name: string, start: number, end: number }, secondFile: { name: string, start: number, end: number }, lines: number }[] }} report
 */
export function crossRepo(report) {
  const place = (/** @type {{ name: string, start: number, end: number }} */ f) => {
    const name = f.name.replace(/\\/g, "/").replace(/^\.\//, "");
    const slash = name.indexOf("/");
    return { repo: name.slice(0, slash), path: name.slice(slash + 1), start: f.start, end: f.end };
  };
  return report.duplicates
    .map((d) => ({ a: place(d.firstFile), b: place(d.secondFile), lines: d.lines }))
    .filter(({ a, b }) => a.repo !== b.repo)
    .map(({ a, b, lines }) =>
      `${a.repo}/${a.path}` <= `${b.repo}/${b.path}` ? { a, b, lines } : { a: b, b: a, lines },
    )
    .sort((x, y) =>
      `${x.a.repo}/${x.a.path}:${x.a.start}`.localeCompare(`${y.a.repo}/${y.a.path}:${y.a.start}`),
    );
}

/**
 * jscpd's settings for a copy, here and in no-bloat's "shared copies": a block of 10 lines and 80 tokens, and JavaScript read
 * as TypeScript. jscpd compares files of one format only, so without the mapping a site's .ts copy of site-runtime's or
 * Prelum's .mjs was never seen. JSX goes with TSX the same way.
 */
export const COPY_ARGS = [
  "--min-lines",
  "10",
  "--min-tokens",
  "80",
  "--formats-exts",
  "typescript:ts,mts,cts,js,mjs,cjs;tsx:tsx,jsx",
];

/** What a shared package ships that is not its source: nested installs, tests, fixtures, minified and declaration files. */
const PACKAGE_SKIP =
  /(?:^|\/)(?:node_modules|test|tests|__tests__|__mocks__|e2e|fixtures?)\/|\.(?:test|spec)\.[^/]+$|\.min\.[^/]+$|\.d\.[cm]?ts$/;

/** Every file under a directory, as paths relative to it. */
function walk(/** @type {string} */ dir, prefix = "") {
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(join(dir, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") out.push(...walk(dir, rel));
    } else if (entry.isFile()) out.push(rel);
  }
  return out;
}

/**
 * The blocks a repository copied from the shared packages it installs, found by their code, so a copy under a new name is
 * caught on the pull request that adds it and not a day later in the network scan. jscpd reads the repository's tracked
 * source (what isSource reads) and each package's shipped source together, with no config of the repository's, and every
 * block with one place in the repository and the other in a package counts.
 * @param {string} root the repository
 * @param {string[]} paths the repository's files, from its root
 * @param {{ repo: string, dir: string }[]} packages each installed shared package and its directory
 * @param {(args: string[]) => void} run jscpd with these arguments, from any directory
 * @returns {{ repo: string, path: string, start: number, end: number }[][]} each copy, the repository's place first
 */
export function packageCopies(root, paths, packages, run) {
  if (packages.length === 0) return [];
  const work = mkdtempSync(join(tmpdir(), "devkit-package-copies-"));
  try {
    const all = join(work, "all");
    const put = (/** @type {string} */ from, /** @type {string} */ to) => {
      mkdirSync(dirname(join(all, to)), { recursive: true });
      copyFileSync(from, join(all, to));
    };
    // "+repo" cannot be a package's repository name, so the two sides never mix.
    for (const path of paths.filter(isSource)) put(join(root, path), `+repo/${path}`);
    for (const { repo, dir } of packages)
      for (const path of walk(dir))
        if (SOURCE.test(path) && !PACKAGE_SKIP.test(path)) put(join(dir, path), `${repo}/${path}`);
    const config = join(work, "jscpd.json");
    writeFileSync(config, "{}\n");
    const out = join(work, "report");
    const flags = ["--config", config, "--reporters", "json", "--output", out, "--silent"];
    run([all, ...COPY_ARGS, ...flags]);
    const report = JSON.parse(readFileSync(join(out, "jscpd-report.json"), "utf8"));
    // jscpd 4 names a file from the directory it ran in, jscpd 5 from the folder it scanned.
    const inAll = (/** @type {string} */ name) => {
      const from = relative(all, resolve(root, name));
      return from.startsWith("..") || isAbsolute(from) ? name : from;
    };
    for (const d of report.duplicates)
      for (const f of [d.firstFile, d.secondFile]) f.name = inAll(f.name);
    return crossRepo(report)
      .filter(({ a, b }) => (a.repo === "+repo") !== (b.repo === "+repo"))
      .map(({ a, b }) => (a.repo === "+repo" ? [a, b] : [b, a]));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** The source files that can export a name. */
const CODE = /\.[cm]?[jt]sx?$/;

/**
 * Copies one checkout's tracked source into dest/<repo>, and returns how many files that was, the hashes of its whole
 * .claude files and the text of its code files, for the name pass.
 */
export function gather(
  /** @type {string} */ checkout,
  /** @type {string} */ repo,
  /** @type {string} */ dest,
) {
  const tracked = execFileSync("git", ["ls-files", "-z"], {
    cwd: checkout,
    encoding: "utf8",
    maxBuffer: BUFFER,
  }).split("\0");
  const files = tracked.filter(isSource);
  /** @type {{ repo: string, path: string, text: string }[]} */
  const code = [];
  for (const file of files) {
    const from = join(checkout, file);
    if (!existsSync(from)) continue;
    const to = join(dest, repo, file);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
    if (CODE.test(file)) code.push({ repo, path: file, text: readFileSync(from, "utf8") });
  }
  const whole = tracked
    .filter((file) => isWholeFile(file) && existsSync(join(checkout, file)))
    .map((file) => ({
      repo,
      path: file,
      hash: createHash("sha256")
        .update(readFileSync(join(checkout, file)))
        .digest("hex"),
    }));
  return { count: files.length, whole, code };
}

/** Runs jscpd over the gathered folder and returns its JSON report. */
export function jscpd(
  /** @type {string} */ dir,
  /** @type {string} */ tool,
  /** @type {string[]} */ args,
) {
  const out = join(dirname(dir), "report");
  const r = spawnSync(
    "npx",
    [
      "--yes",
      "--package",
      tool,
      "--",
      "jscpd",
      ".",
      ...args,
      "--reporters",
      "json",
      "--output",
      out,
      "--silent",
    ],
    {
      cwd: dir,
      encoding: "utf8",
      maxBuffer: BUFFER,
    },
  );
  if (r.error || r.status !== 0)
    throw new Error(
      `jscpd exited ${r.status}: ${(r.error?.message ?? r.stderr ?? r.stdout).trim().slice(0, 400)}`,
    );
  return JSON.parse(readFileSync(join(out, "jscpd-report.json"), "utf8"));
}
