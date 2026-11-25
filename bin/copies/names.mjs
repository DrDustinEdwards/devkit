import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { distinctive, exportNames } from "../shared/copies.mjs";
import { PACKAGES } from "../shared/data.mjs";

export const OWNER = "DrDustinEdwards";
export const BUFFER = 256 * 1024 * 1024;

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
export const isSource = (/** @type {string} */ path) => SOURCE.test(path) && !SKIP.test(path);

/**
 * The .claude files jscpd does not read (agents, skills, commands, rules: Markdown and the like), compared whole instead.
 * The settings files are left out: .claude/settings.json is each repository's own permissions plus the hook block devkit's
 * README has every repository paste, so the same bytes there are the shared way, not a copy.
 */
export const isWholeFile = (/** @type {string} */ path) =>
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

/** The shared packages' repositories: a name one of them exports is devkit-shared's copies check to judge, by its catalog. */
const PACKAGE_REPOS = new Set(PACKAGES.map((p) => p.repo));

/** The exports React Router reads from a route module by name: every app has them, by design. */
const ROUTE_EXPORTS = new Set([
  "clientLoader",
  "clientAction",
  "shouldRevalidate",
  "HydrateFallback",
  "ErrorBoundary",
]);

/**
 * What defines nothing of its own: a re-export (`export { x } from "..."`; `export { x }` of an import is importedNames),
 * and a Drizzle table, which mirrors in each app's schema the SQL a shared package ships (site-api's media and store
 * tables), so the same table name in two apps is the shared schema, not a second job.
 */
const NOT_OWN =
  /export\s*(?:type\s*)?\{[^}]*\}\s*from\s*["'][^"']+["']|export\s+const\s+[A-Za-z_$][\w$]*\s*=\s*(?:sqliteTable|pgTable|mysqlTable)\s*\(/g;

/** The names a module imports: what `export { x }` then passes on, which defines nothing. */
const importedNames = (/** @type {string} */ text) =>
  new Set(
    [...text.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from/g)].flatMap(
      (m) => m[1].match(/[\w$]+/g) ?? [],
    ),
  );

/**
 * Distinctive names (devkit-shared's rule) that two or more repositories each define and export, none of them a shared
 * package: the same job written twice under one name, which jscpd misses when the code differs. With `packages`, the
 * other way round: names two or more shared packages each export, which is overlap between the packages themselves (the
 * same job in site-api and Prelum, say), the one place a name check over the sites cannot see. Pure.
 * @param {{ repo: string, path: string, text: string }[]} files code files
 * @param {boolean} [packages] read the shared packages' repositories instead of the others
 */
export function sharedNames(files, packages = false) {
  /** @type {Map<string, Map<string, string>>} name -> repo -> its first path */
  const defined = new Map();
  for (const { repo, path, text } of files) {
    if (PACKAGE_REPOS.has(repo) !== packages) continue;
    const imported = importedNames(text);
    for (const name of exportNames(text.replace(NOT_OWN, ""))) {
      if (!distinctive(name) || ROUTE_EXPORTS.has(name) || imported.has(name)) continue;
      const repos = defined.get(name) ?? new Map();
      if (!repos.has(repo)) repos.set(repo, path);
      defined.set(name, repos);
    }
  }
  return [...defined]
    .filter(([, repos]) => repos.size > 1)
    .map(([name, repos]) => ({
      name,
      places: [...repos]
        .map(([repo, path]) => ({ repo, path }))
        .sort((a, b) => a.repo.localeCompare(b.repo)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
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

const PRIVATE = new Set();
export const at = (
  /** @type {{ repo: string, path: string }} */ p,
  /** @type {string} */ range = "",
) => (PRIVATE.has(p.repo) ? "a private repository" : `${p.repo}/${p.path}${range}`);

/**
 * The owner's repositories that are neither forks nor archived, by name: every one the token can read when there is a
 * token for the owner (a fine-grained token lists its repositories at /user/repos), the public ones otherwise.
 */
export async function ownerRepos(/** @type {string | undefined} */ token) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "devkit-copies",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const list = token
    ? "https://api.github.com/user/repos?affiliation=owner&visibility=all"
    : `https://api.github.com/users/${OWNER}/repos?type=owner`;
  const names = [];
  for (let page = 1; ; page++) {
    const resp = await fetch(`${list}&per_page=100&page=${page}`, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    if (!resp.ok) throw new Error(`GitHub answered ${resp.status} for the repository list`);
    const repos = await resp.json();
    for (const repo of repos) {
      if (repo.owner?.login === OWNER && !repo.fork && !repo.archived) names.push(repo.name);
      if (repo.private) PRIVATE.add(repo.name);
    }
    if (repos.length < 100) return names.sort();
  }
}

/** The environment that gives git the token as an Authorization header, as actions/checkout does, off the command line. */
export function gitAuthEnv(/** @type {string | undefined} */ token) {
  if (!token) return { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
  };
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
