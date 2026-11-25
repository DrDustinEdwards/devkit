import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix, relative, sep } from "node:path";
import { BUFFER, messageOf } from "./tools.mjs";

/** @typedef {import("./scan.mjs").Config} Config */

/** The default branch a run is checked against when `--lines-from` is not given, the first that resolves. */
const UPSTREAMS = ["origin/HEAD", "origin/main", "origin/master"];

export const LOCKFILES = /^(?:package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml)$/;

/** package.json keys that configure a tool instead of the package: a change to one is a change to how it counts. */
export const TOOL_KEYS = ["knip", "jscpd"];

/** -1, 0 or 1 for two x.y.z versions. */
export function compareVersions(/** @type {string} */ a, /** @type {string} */ b) {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  const d = x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  return Math.sign(d);
}

/** The value of `--flag value` or `--flag=value` for each flag in `names`. */
export function flagValues(/** @type {string[]} */ args, /** @type {string[]} */ names) {
  return args.flatMap((arg, i) => {
    const eq = names.find((n) => arg.startsWith(`${n}=`));
    if (eq) return [arg.slice(eq.length + 1)];
    return names.includes(args[i - 1] ?? "") ? [arg] : [];
  });
}

/**
 * The change against the merge base of `from` with the working tree (so a local run sees what is not committed yet): the
 * config there (null when the file did not exist), the files it changes, and each file at the base and now.
 */
export function atBase(
  /** @type {string} */ root,
  /** @type {string} */ file,
  /** @type {string} */ from,
  /** @type {Config} */ current = {},
) {
  const git = (/** @type {string[]} */ args) =>
    execFileSync("git", ["-c", "core.quotePath=false", ...args], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: BUFFER,
      stdio: ["ignore", "pipe", "pipe"],
    });
  const base = git(["merge-base", from, "HEAD"]).trim();
  const head = git(["rev-parse", "HEAD"]).trim();
  // A base that is HEAD itself compares the change with itself. On a pull request the base is its first parent, so this
  // is a run pointed at its own commit while the default branch says the change is not in it yet.
  if (base === head)
    for (const ref of UPSTREAMS) {
      let tip;
      try {
        tip = git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]).trim();
      } catch {
        continue;
      }
      if (git(["merge-base", tip, head]).trim() !== head)
        throw new Error(
          `${from} is the change itself (its merge base with HEAD is HEAD, which ${ref} does not have). Pass the branch the change goes into.`,
        );
    }
  const before = (/** @type {string} */ path) =>
    git(["ls-tree", "--name-only", base, "--", path]).trim()
      ? git(["show", `${base}:${path}`])
      : null;
  const now = (/** @type {string} */ path) =>
    existsSync(join(root, path)) ? readFileSync(join(root, path), "utf8") : null;
  const untracked = git(["ls-files", "--others", "--exclude-standard", "-z"])
    .split("\0")
    .filter(Boolean);
  const configPath = posix.normalize(relative(root, file).split(sep).join("/"));
  const old = before(configPath);
  const config = /** @type {Config | null} */ (old === null ? null : JSON.parse(old));
  const changed = [
    ...git(["diff", "--name-only", "-z", base]).split("\0").filter(Boolean),
    ...untracked,
  ];
  const created = [
    ...git(["diff", "--name-only", "--diff-filter=A", "-z", base]).split("\0").filter(Boolean),
    ...untracked,
  ];
  // Every line the change adds, with its file, as `git diff -U0` prints it, untracked files whole.
  /** @type {Array<{ path: string, text: string }>} */
  const added = [];
  let path = "";
  for (const l of git(["diff", "-U0", "--no-color", "--no-ext-diff", base]).split("\n")) {
    if (l.startsWith("+++ ")) {
      const p = l.slice(4).replace(/\t$/, "");
      path = (p.startsWith('"') ? JSON.parse(p) : p).replace(/^b\//, "");
    } else if (l.startsWith("+")) added.push({ path, text: l.slice(1) });
  }
  for (const p of untracked)
    if (lstatSync(join(root, p)).isFile())
      for (const text of (now(p) ?? "").split("\n")) added.push({ path: p, text });
  // Tracked files a .gitignore hides, with the line that hides each: Knip skips them though git keeps them.
  const hiddenPaths = git(["ls-files", "-z", "-ci", "--exclude-standard"])
    .split("\0")
    .filter(Boolean);
  /** @type {Array<{ source: string, line: string, pattern: string, path: string }>} */
  const ignored = [];
  if (hiddenPaths.length) {
    const r = spawnSync("git", ["check-ignore", "-v", "-z", "--no-index", "--stdin"], {
      cwd: root,
      input: hiddenPaths.join("\0"),
      encoding: "utf8",
      maxBuffer: BUFFER,
    });
    const f = r.stdout.split("\0");
    for (let i = 0; i + 3 < f.length; i += 4)
      ignored.push({ source: f[i], line: f[i + 1], pattern: f[i + 2], path: f[i + 3] });
  }
  return {
    base,
    config,
    configPath,
    changed,
    created,
    added,
    ignored,
    // A Knip config a run names with --config, at the base or now, is a definition like knip.json.
    definitions: [
      ...new Set(
        [config, current].flatMap((c) =>
          flagValues(
            (c?.knip ?? []).flatMap((r) => r.args ?? []),
            ["--config", "-c"],
          ).map((p) => posix.normalize(p)),
        ),
      ),
    ],
    before,
    now,
  };
}

/**
 * The tracked files a change leaves hidden from Knip by a .gitignore line (Knip reads none of them): one the change adds
 * or edits, and any a line new in the change hides. Pure.
 * @param {Array<{ source: string, line: string, pattern: string, path: string }>} ignored
 * @param {string[]} changed @param {(path: string) => string | null} before
 */
export function hiddenFiles(ignored, changed, before) {
  const touched = new Set(changed);
  return ignored
    .filter(
      ({ source, pattern, path }) =>
        touched.has(path) ||
        (touched.has(source) &&
          !(before(source) ?? "").split("\n").some((l) => l.trim() === pattern.trim())),
    )
    .map(
      ({ source, line, pattern, path }) =>
        `${path} is tracked, but ${source} line ${line} (${pattern}) hides it from Knip, so nothing in it is counted. Remove the file, or the ignore line.`,
    );
}

/**
 * The files a change creates that jscpd skips (unreadFiles): a copy there is never counted. The
 * count alone misses one when another file starts being read in the same change. Pure.
 * @param {string[]} unread @param {string[]} created
 */
export function unreadAdded(unread, created) {
  const fresh = new Set(created);
  return unread
    .filter((p) => fresh.has(p))
    .map(
      (p) =>
        `${p} is new, and jscpd does not read it, so a copy in it is never counted. Widen jscpd's path in a change of its own, or move the file where jscpd reads.`,
    );
}

/**
 * A directory with more than one lockfile: npm reads npm-shrinkwrap.json before package-lock.json, and pnpm its own, so
 * which one installs depends on the tool, and the other is a stale record of what is installed. Pure.
 * @param {string[]} paths every file in the repository
 */
export function lockfileProblems(paths) {
  /** @type {Map<string, string[]>} */
  const byDir = new Map();
  for (const p of paths)
    if (LOCKFILES.test(posix.basename(p)))
      byDir.set(posix.dirname(p), [...(byDir.get(posix.dirname(p)) ?? []), posix.basename(p)]);
  return [...byDir]
    .filter(([, names]) => names.length > 1)
    .map(
      ([dir, names]) =>
        `${dir === "." ? "the root" : dir} has ${names.join(" and ")}. Keep the one lockfile its package manager installs from, and delete the other.`,
    );
}

/**
 * The base a run checks the baseline against: `--lines-from`, else the default branch. Only a run in Actions with none of
 * them (a shallow checkout of the default branch, or a merge queue whose pull request ran it) has no base; a local run
 * with none fails, and setting GITHUB_ACTIONS does not skip a base that resolves.
 */
export function baseRef(/** @type {string} */ root, /** @type {string | undefined} */ from) {
  if (from) return from;
  for (const ref of UPSTREAMS)
    try {
      execFileSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], {
        cwd: root,
        stdio: "ignore",
      });
      return ref;
    } catch {}
  if (process.env.GITHUB_ACTIONS === "true") return null;
  throw new Error(
    `none of ${UPSTREAMS.join(", ")} resolves, so a raised baseline cannot be told from the count. Pass --lines-from <rev> (the branch the change goes into).`,
  );
}

/**
 * What is wrong with the devkit installed at `dir`, for the workflows to check before they run its bin. `ownDir` is the
 * devkit the workflow runs from, which the caller pinned. The installed version must be an exact x.y.z no older than
 * its own, and every file of the package (the `files` its own package.json lists) must be byte for byte the file at that
 * version: its own file at the same version, else the file at the version's tag (`blobsAt` gives each path's git blob id
 * there). So a fork, a path, a lockfile that resolves elsewhere or an install script that rewrites the bin each fails,
 * whatever version it claims. package.json is not compared: it only names the version the files are judged against.
 * @param {string} dir @param {string} ownDir @param {(tag: string) => Map<string, string>} blobsAt
 */
export function installedRelease(dir, ownDir, blobsAt) {
  const { version } = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const own = JSON.parse(readFileSync(join(ownDir, "package.json"), "utf8"));
  const exact = /^\d+\.\d+\.\d+$/;
  if (!exact.test(version) || !exact.test(own.version))
    return [`devkit ${version} is installed, and only a release's x.y.z version can be judged.`];
  if (compareVersions(version, own.version) < 0)
    return [
      `devkit ${version} is installed, older than the ${own.version} this workflow runs. Move devkit forward, never back.`,
    ];
  const blob = (/** @type {Buffer} */ body) =>
    createHash("sha1").update(`blob ${body.length}\0`).update(body).digest("hex");
  /** @type {(path: string) => string | undefined} */
  let expected;
  if (version === own.version)
    expected = (path) =>
      existsSync(join(ownDir, path)) ? blob(readFileSync(join(ownDir, path))) : undefined;
  else {
    /** @type {Map<string, string>} */
    let blobs;
    try {
      blobs = blobsAt(`v${version}`);
    } catch (error) {
      return [`devkit's tag v${version} could not be read: ${messageOf(error)}`];
    }
    expected = (path) => blobs.get(path);
  }
  /** @type {string[]} */
  const out = [];
  const check = (/** @type {string} */ path) => {
    const full = join(dir, path);
    if (!existsSync(full)) return;
    if (lstatSync(full).isDirectory()) {
      for (const entry of readdirSync(full)) check(`${path}/${entry}`);
      return;
    }
    const want = expected(path);
    if (want !== blob(readFileSync(full)))
      out.push(
        `${path} in the installed devkit is not the file at ${version}${want ? "" : ", which has no such file"}. Install devkit from its release tag, and let nothing rewrite it.`,
      );
  };
  for (const entry of own.files ?? ["bin"]) check(entry);
  if (!existsSync(join(dir, "bin", "no-bloat.mjs")))
    out.push("the installed devkit has no bin/no-bloat.mjs.");
  return out;
}

/** Each path's blob id at a devkit tag, fetched from GitHub into a scratch repository. */
export function devkitBlobs(/** @type {string} */ tag) {
  const dir = mkdtempSync(join(tmpdir(), "devkit-tag-"));
  const git = (/** @type {string[]} */ args) =>
    execFileSync("git", args, {
      cwd: dir,
      encoding: "utf8",
      maxBuffer: BUFFER,
      stdio: ["ignore", "pipe", "pipe"],
    });
  try {
    git(["init", "-q", "--bare"]);
    git([
      "fetch",
      "-q",
      "--depth=1",
      "--no-tags",
      "https://github.com/DrDustinEdwards/devkit",
      `refs/tags/${tag}`,
    ]);
    return new Map(
      git(["ls-tree", "-r", "-z", "FETCH_HEAD"])
        .split("\0")
        .filter(Boolean)
        .map((line) => {
          const [meta, path] = line.split("\t");
          return [path, meta.split(" ")[2]];
        }),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
