import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, posix } from "node:path";
import { used } from "./core.mjs";

/** @typedef {import("./core.mjs").Config} Config */
/** @typedef {import("./core.mjs").Finding} Finding */

/**
 * One British word rewritten the American way in a line, keeping its case: inside a camelCase or CONSTANT_CASE name too
 * when `names`, never in text `protect` matches. Case-insensitive by letter, not by flag, since
 * under the i flag [a-z] would match the capital that starts a name's next part: a capital may start a part anywhere, a
 * small letter only after a non-letter.
 * @param {string} text @param {string} from @param {string} to @param {RegExp} protect a global regex @param {boolean} names
 */
export function respell(text, from, to, protect, names) {
  const guarded = [...text.matchAll(protect)].map((g) => [g.index, g.index + g[0].length]);
  const [first, ...rest] = Array.from(from.toLowerCase());
  const body = rest.map((c) => `[${c}${c.toUpperCase()}]`).join("");
  const start = names
    ? `(?:(?<![A-Za-z])${first}|${first.toUpperCase()})`
    : `(?<![A-Za-z0-9_$])[${first}${first.toUpperCase()}]`;
  const tail = names ? "(?![a-z])" : "(?![A-Za-z0-9_$])";
  const cased = to.toLowerCase();
  return text.replace(new RegExp(`${start}${body}${tail}`, "g"), (word, at) => {
    if (guarded.some(([a, b]) => at < b && at + word.length > a)) return word;
    if (word === word.toUpperCase()) return cased.toUpperCase();
    if (word[0] === word[0].toUpperCase()) return cased[0].toUpperCase() + cased.slice(1);
    return cased;
  });
}

/**
 * British spellings, from codespell's en-GB to en-US list.
 * @param {string} root @param {Config} config @param {boolean} fix
 * @returns {Finding[]}
 */
export function checkSpelling(root, config, fix = false, names = true) {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  const skip = [
    ...(config.spelling?.skip ?? []),
    "**/*.lock",
    "**/package-lock.json",
    "**/pnpm-lock.yaml",
    ".shared.json",
  ];
  const targets = files.filter(
    (f) =>
      !skip.some((s) => posix.matchesGlob?.(f, s) ?? f === s) &&
      !/\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|pdf|zip|gz|wasm)$/i.test(f),
  );
  // Names other tools own: GitHub Actions' cancelled(), Renovate's minimumReleaseAgeBehaviour, and ARIA's labelledby as a // codespell:ignore
  // camelCase name (labelledBy, ariaLabelledByElements). codespell:ignore
  const builtIn = String.raw`\bcancelled\\?\(|\bminimumReleaseAgeBehaviour\b|[lL]abelledBy`; // codespell:ignore
  const { ignore = [], contracts = [] } = config.spelling ?? {};
  const ignoreRegex = [builtIn, ...contracts].join("|");
  /** @returns {{ file: string, line: number, from: string, to: string }[]} */
  const read = (/** @type {string} */ regex, /** @type {string[]} */ words) => {
    const args = [
      "--builtin",
      "en-GB_to_en-US",
      "--quiet-level",
      "3",
      "--check-filenames",
      "--ignore-regex",
      regex,
    ];
    if (words.length) args.push("--ignore-words-list", words.join(","));
    // Each part of a camelCase or CONSTANT_CASE name is read as a word, since a British name is spelling too.
    args.push("--regex", "[A-Z]?[a-z]+|[A-Z]+(?![a-z])");
    const out = [];
    for (let i = 0; i < targets.length; i += 400) {
      for (const line of codespell([...args, "--", ...targets.slice(i, i + 400)], root).split(
        "\n",
      )) {
        // A hit in a file name has no line: `file: word ==> fix`. It is reported on the file, with line 0.
        const m = /^(.+?):(?:(\d+):)? (\S+) ==> (\S+)/.exec(line);
        if (m) out.push({ file: m[1], line: Number(m[2] ?? 0), from: m[3], to: m[4] });
      }
    }
    return out;
  };
  const hits = read(ignoreRegex, ignore);
  const found = hits.map(({ file, line, from, to }) => ({
    check: "spelling",
    file,
    line,
    message: line
      ? `${from} is British; write ${to} (or end the line with a codespell:ignore comment if it is a data contract)`
      : `${from} in the file name is British; rename the file to use ${to}`,
  }));
  // An ignore or contract is used when a run without the repository's own finds more, in its word or on a line it matches.
  if (!fix && (ignore.length || contracts.length)) {
    const seen = new Set(hits.map((h) => `${h.file}:${h.line}:${h.from}`));
    const more = read(builtIn, []).filter((h) => !seen.has(`${h.file}:${h.line}:${h.from}`));
    for (const word of ignore)
      if (more.some((h) => h.from.toLowerCase() === word.toLowerCase()))
        used(config, "spelling.ignore", word);
    for (const contract of contracts) {
      /** @type {RegExp | null} */
      let re = null;
      try {
        re = new RegExp(contract);
      } catch {}
      if (
        !re ||
        more.some(
          (h) =>
            h.line > 0 &&
            re.test(readFileSync(join(root, h.file), "utf8").split("\n")[h.line - 1] ?? ""),
        )
      )
        used(config, "spelling.contracts", contract);
    }
  }
  if (!fix) return found;
  // The fix rewrites what the check found, word by word: inside a name too (serialiseTags), never text a contract or // codespell:ignore
  // an ignore regex covers, and keeping each word's case. In a shared package (names false) a word inside a name is
  // left: renaming an export breaks every site that imports it, so it is renamed by hand with the old name kept.
  const protect = new RegExp(ignoreRegex, "g");
  const byFile = Map.groupBy(
    hits.filter((h) => h.line > 0),
    (h) => h.file,
  );
  for (const [file, list] of byFile) {
    const lines = readFileSync(join(root, file), "utf8").split("\n");
    for (const { line, from, to } of list) {
      lines[line - 1] = respell(lines[line - 1], from, to, protect, names);
    }
    writeFileSync(join(root, file), lines.join("\n"));
  }
  return checkSpelling(root, config, false);
}

/** codespell from PATH, else through pipx at a pinned version. Its own exit code says only whether it found something. */
function codespell(/** @type {string[]} */ args, /** @type {string} */ cwd) {
  /** @type {[string, string[]][]} */
  const runners = [
    ["codespell", []],
    ["pipx", ["run", "codespell==2.4.3"]],
  ];
  for (const [cmd, pre] of runners) {
    const run = spawnSync(cmd, [...pre, ...args], {
      cwd,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    if (run.error) continue;
    if (run.status !== 0 && run.status !== 65)
      throw new Error(`codespell failed: ${run.stderr.trim()}`);
    return run.stdout;
  }
  throw new Error(
    "codespell is not installed and pipx is not either: pip install codespell==2.4.3",
  );
}
