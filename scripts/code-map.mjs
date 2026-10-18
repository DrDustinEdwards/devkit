#!/usr/bin/env node
// The code map (capsid/research/design-system-explorer.md section 5, slice 8): one JSON file per public repository saying,
// for every module, how big it is, what it imports and whether it sits in an import cycle, and for every function its
// cyclomatic complexity, its share of statements covered, its CRAP score and, when a Stryker report is given, its mutants
// and mutation score. Capsid publishes it and the explorer at capsid.dustinedwards.info draws it.
//
// Everything is read through the repository's own TypeScript, so there is no dependency here and no second parser:
// imports are resolved by ts.resolveModuleName with the repository's compiler options, and complexity is counted on the
// syntax tree. Coverage is Vitest's (istanbul's) coverage-final.json and mutation is Stryker's mutation.json, each mapped
// onto the innermost function whose lines hold a statement or a mutant. A number nobody measured is null, never 0.
//
// Mutation runs less often than the map (weekly, design D11), so a run's reports are kept as one smaller file, mutation.json,
// beside the map: the commit and day of the run, and per file its source then and each mutant's status and line. A later map
// reads that file, places each mutant in the function it was made in from the source then, and carries the numbers to a
// function whose lines are unchanged since. A function that changed, or is new, is `stale: true` with no numbers, and the
// map names the run it read as `mutated`.
//
//   node code-map.mjs --out code-map.json [--tsconfig tsconfig.json] [--include src/] [--coverage <file>]
//     [--mutation <stryker report>]... [--mutation-kept <mutation.json>] [--mutation-out <mutation.json>]
//
// The repository and commit come from GITHUB_REPOSITORY and GITHUB_SHA, or --repo and --sha. code-map.yml carries this file
// byte for byte; after an edit run `node scripts/inline-rollback-guard.mjs`.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

/** CRAP = CC² × (1 − coverage)³ + CC (crap4j's formula), rounded to two places. Null when coverage was not measured. */
export function crap(/** @type {number} */ cc, /** @type {number | null} */ coverage) {
  if (coverage === null) return null;
  return Math.round((cc * cc * (1 - coverage) ** 3 + cc) * 100) / 100;
}

/** The repository's TypeScript, from its own node_modules, so the map parses what its compiler parses. */
export function loadTypeScript(/** @type {string} */ root) {
  for (const base of [join(root, "package.json"), import.meta.url]) {
    try {
      return createRequire(base)("typescript");
    } catch {
      // Try the next place.
    }
  }
  throw new Error("typescript is not installed in the repository; the code map reads its code through it");
}

/**
 * Every function in a source file with its lines and cyclomatic complexity: 1, plus one for each branch (if, ?:, a loop,
 * a case, a catch, &&, ||, ?? and their assignments) in its own body, not in a function nested inside it.
 * @param {any} ts @param {any} sf
 * @returns {{ name: string, line: number, end: number, cc: number }[]}
 */
export function functionsOf(ts, sf) {
  /** @type {{ name: string, line: number, end: number, cc: number }[]} */
  const out = [];
  const K = ts.SyntaxKind;
  const LOGICAL = new Set([K.AmpersandAmpersandToken, K.BarBarToken, K.QuestionQuestionToken, K.AmpersandAmpersandEqualsToken, K.BarBarEqualsToken, K.QuestionQuestionEqualsToken]);
  const isFunction = (/** @type {any} */ n) =>
    ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n) ||
    ts.isConstructorDeclaration(n) || ts.isGetAccessorDeclaration(n) || ts.isSetAccessorDeclaration(n);
  const lineOf = (/** @type {number} */ pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const nameOf = (/** @type {any} */ n) => {
    if (ts.isConstructorDeclaration(n)) return "constructor";
    if (n.name && (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name) || ts.isPrivateIdentifier(n.name))) return n.name.text;
    const p = n.parent;
    if (p && (ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p)) && ts.isIdentifier(p.name)) return p.name.text;
    return `<anonymous:${lineOf(n.getStart(sf))}>`;
  };
  const branches = (/** @type {any} */ n) => {
    let count = 0;
    const walk = (/** @type {any} */ c) => {
      if (isFunction(c)) return;
      if (ts.isIfStatement(c) || ts.isConditionalExpression(c) || ts.isForStatement(c) || ts.isForInStatement(c) ||
        ts.isForOfStatement(c) || ts.isWhileStatement(c) || ts.isDoStatement(c) || ts.isCaseClause(c) || ts.isCatchClause(c)) count++;
      else if (ts.isBinaryExpression(c) && LOGICAL.has(c.operatorToken.kind)) count++;
      ts.forEachChild(c, walk);
    };
    if (ts.isBlock(n.body)) ts.forEachChild(n.body, walk);
    else walk(n.body);
    return count;
  };
  const visit = (/** @type {any} */ n) => {
    if (isFunction(n) && n.body) out.push({ name: nameOf(n), line: lineOf(n.getStart(sf)), end: lineOf(n.getEnd()), cc: 1 + branches(n) });
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** The module specifiers a file imports or re-exports, static and dynamic. @param {any} ts @param {any} sf */
export function specifiersOf(ts, sf) {
  /** @type {string[]} */
  const out = [];
  const visit = (/** @type {any} */ n) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) out.push(n.moduleSpecifier.text);
    else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) out.push(n.arguments[0].text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** Every import cycle (Tarjan's strongly connected components of two or more modules, or one that imports itself). */
export function cyclesOf(/** @type {Map<string, string[]>} */ graph) {
  let index = 0;
  /** @type {Map<string, number>} */ const idx = new Map();
  /** @type {Map<string, number>} */ const low = new Map();
  /** @type {string[]} */ const stack = [];
  const on = new Set();
  /** @type {string[][]} */ const out = [];
  const connect = (/** @type {string} */ v) => {
    idx.set(v, index);
    low.set(v, index++);
    stack.push(v);
    on.add(v);
    for (const w of graph.get(v) ?? []) {
      if (!idx.has(w)) {
        connect(w);
        low.set(v, Math.min(/** @type {number} */ (low.get(v)), /** @type {number} */ (low.get(w))));
      } else if (on.has(w)) low.set(v, Math.min(/** @type {number} */ (low.get(v)), /** @type {number} */ (idx.get(w))));
    }
    if (low.get(v) === idx.get(v)) {
      /** @type {string[]} */ const component = [];
      let w;
      do {
        w = /** @type {string} */ (stack.pop());
        on.delete(w);
        component.push(w);
      } while (w !== v);
      if (component.length > 1 || (graph.get(v) ?? []).includes(v)) out.push(component.sort());
    }
  };
  for (const v of [...graph.keys()].sort()) if (!idx.has(v)) connect(v);
  return out.sort((a, b) => a[0].localeCompare(b[0]));
}

/**
 * The innermost function whose lines hold `line`, or undefined.
 * @template {{ line: number, end: number }} F
 * @param {F[]} fns @param {number} line
 */
function innermost(fns, line) {
  let best;
  for (const f of fns) if (f.line <= line && line <= f.end && (!best || f.end - f.line < best.end - best.line)) best = f;
  return best;
}

/** Stryker's statuses: detected and valid, as its mutation score counts them. */
const DETECTED = new Set(["Killed", "Timeout"]);
const VALID = new Set(["Killed", "Timeout", "Survived", "NoCoverage"]);

/**
 * One kept mutation report from a run's Stryker reports (one per chunk or shard): per file its source and each valid
 * mutant's status and line, with the run's commit and day.
 * @param {any[]} reports @param {string} sha @param {string} date
 */
export function keptReport(reports, sha, date) {
  /** @type {Record<string, { source: string | null, mutants: { status: string, location: { start: { line: number } } }[] }>} */
  const files = {};
  for (const r of reports) {
    for (const [path, f] of Object.entries(r?.files ?? {})) {
      const mutants = (/** @type {any} */ (f).mutants ?? [])
        .filter((/** @type {any} */ m) => VALID.has(m.status))
        .map((/** @type {any} */ m) => ({ status: m.status, location: { start: { line: m.location.start.line } } }));
      const was = files[path];
      files[path] = { source: was?.source ?? /** @type {any} */ (f).source ?? null, mutants: [...(was?.mutants ?? []), ...mutants] };
    }
  }
  return { version: 1, sha, date, files };
}

/**
 * The code map of a repository.
 * @param {{ ts: any, root: string, tsconfig?: string, include?: string[], coverage?: any, mutation?: any, repo: string, sha: string, date: string }} o
 */
export function codeMap({ ts, root, tsconfig = "tsconfig.json", include = ["src/"], coverage = null, mutation = null, repo, sha, date }) {
  const parsed = ts.getParsedCommandLineOfConfigFile(resolve(root, tsconfig), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: (/** @type {any} */ d) => { throw new Error(ts.flattenDiagnosticMessageText(d.messageText, "\n")); } });
  const rel = (/** @type {string} */ abs) => relative(root, abs).split(sep).join("/");
  const files = parsed.fileNames
    .filter((f) => /\.[cm]?tsx?$/.test(f) && !/\.d\.[cm]?ts$/.test(f) && include.some((p) => rel(f).startsWith(p)))
    .sort();
  const mapped = new Set(files.map(rel));
  const host = ts.createCompilerHost(parsed.options);
  /** @type {Map<string, string[]>} */
  const graph = new Map();
  const modules = files.map((abs) => {
    const path = rel(abs);
    const text = readFileSync(abs, "utf8");
    const sf = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true);
    const imports = new Set();
    for (const spec of specifiersOf(ts, sf)) {
      const hit = ts.resolveModuleName(spec, abs, parsed.options, host).resolvedModule;
      if (hit && mapped.has(rel(hit.resolvedFileName))) imports.add(rel(hit.resolvedFileName));
    }
    graph.set(path, [...imports].sort());
    /** @type {{ name: string, line: number, end: number, cc: number, statements: number, covered: number, mutants: number, detected: number, stale?: true }[]} */
    const fns = functionsOf(ts, sf).map((f) => ({ ...f, statements: 0, covered: 0, mutants: 0, detected: 0 }));

    const cov = coverage?.[abs] ?? coverage?.[path];
    if (cov) {
      for (const [id, s] of Object.entries(cov.statementMap ?? {})) {
        const f = innermost(fns, /** @type {any} */ (s).start.line);
        if (!f) continue;
        f.statements++;
        if ((cov.s?.[id] ?? 0) > 0) f.covered++;
      }
    }
    const mut = mutation?.files?.[path] ?? mutation?.files?.[abs];
    if (mut) {
      // Each mutant goes to the function it was made in, read from the file as the run saw it, so lines that moved since
      // still meet their function.
      const then = typeof mut.source === "string" ? functionsOf(ts, ts.createSourceFile(abs, mut.source, ts.ScriptTarget.Latest, true)).map((f) => ({ ...f, mutants: 0, detected: 0 })) : fns;
      for (const m of mut.mutants ?? []) {
        if (!VALID.has(m.status)) continue;
        const f = innermost(then, m.location.start.line);
        if (!f) continue;
        f.mutants++;
        if (DETECTED.has(m.status)) f.detected++;
      }
      if (then !== fns) {
        // A function keeps the run's numbers only when its lines are the same as then: the nth function of a name now
        // against the nth then.
        const linesThen = mut.source.split("\n");
        const linesNow = text.split("\n");
        const body = (/** @type {string[]} */ lines, /** @type {{ line: number, end: number }} */ f) => lines.slice(f.line - 1, f.end).join("\n");
        const keyed = (/** @type {{ name: string }[]} */ list) => {
          /** @type {Map<string, number>} */ const n = new Map();
          return list.map((f) => { const i = n.get(f.name) ?? 0; n.set(f.name, i + 1); return `${f.name}#${i}`; });
        };
        const keysThen = keyed(then);
        const byKey = new Map(then.map((f, i) => [keysThen[i], f]));
        keyed(fns).forEach((key, i) => {
          const was = byKey.get(key);
          if (was && body(linesThen, was) === body(linesNow, fns[i])) Object.assign(fns[i], { mutants: was.mutants, detected: was.detected });
          else Object.assign(fns[i], { stale: true });
        });
      }
    }

    return {
      path,
      loc: text.split("\n").filter((l) => l.trim() !== "").length,
      imports: graph.get(path),
      functions: fns.map(({ name, line, end, cc, statements, covered, mutants, detected, stale }) => {
        const c = cov ? (statements === 0 ? 1 : Math.round((covered / statements) * 1000) / 1000) : null;
        const measured = mut && !stale;
        return { name, line, end, cc, coverage: c, crap: crap(cc, c), mutants: measured ? mutants : null, score: measured && mutants > 0 ? Math.round((detected / mutants) * 1000) / 10 : null, ...(stale ? { stale } : {}) };
      }),
    };
  });
  const cycles = cyclesOf(graph);
  const inCycle = new Set(cycles.flat());
  for (const m of modules) if (inCycle.has(m.path)) Object.assign(m, { cycle: true });
  return {
    version: 1,
    repo,
    sha,
    date,
    tools: { typescript: ts.version, coverage: coverage ? "istanbul" : null, mutation: mutation ? "stryker" : null },
    ...(mutation?.sha && mutation.sha !== sha ? { mutated: { sha: mutation.sha, date: mutation.date } } : {}),
    modules,
    cycles,
  };
}

/** --name value pairs; a repeated name collects every value. @param {string[]} argv */
function args(argv) {
  /** @type {Record<string, string[]>} */
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith("--") || argv[i + 1] === undefined) throw new Error(`expected --name value, got ${argv[i]}`);
    (out[argv[i].slice(2)] ??= []).push(argv[i + 1]);
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = args(process.argv.slice(2));
  const root = process.cwd();
  const json = (/** @type {string | undefined} */ f) => (f && existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null);
  for (const f of [a.coverage?.[0], ...(a.mutation ?? []), a["mutation-kept"]?.[0]]) if (f && !existsSync(f)) console.log(`::warning::${f} does not exist, so the map has no numbers from it`);
  const sha = a.sha?.[0] ?? process.env.GITHUB_SHA ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const date = new Date().toISOString().slice(0, 10);
  // A fresh run's reports win over a kept one; with neither, the map has no mutation numbers.
  const reports = (a.mutation ?? []).map(json).filter(Boolean);
  const mutation = reports.length ? keptReport(reports, sha, date) : json(a["mutation-kept"]?.[0]);
  if (mutation && a["mutation-out"]?.[0]) writeFileSync(a["mutation-out"][0], `${JSON.stringify(mutation)}\n`);
  const map = codeMap({
    ts: loadTypeScript(root),
    root,
    tsconfig: a.tsconfig?.[0],
    include: a.include,
    coverage: json(a.coverage?.[0]),
    mutation,
    repo: a.repo?.[0] ?? process.env.GITHUB_REPOSITORY ?? "",
    sha,
    date,
  });
  writeFileSync(a.out?.[0] ?? "code-map.json", `${JSON.stringify(map, null, 2)}\n`);
  const fns = map.modules.reduce((n, m) => n + m.functions.length, 0);
  const stale = map.modules.reduce((n, m) => n + m.functions.filter((f) => f.stale).length, 0);
  console.log(`code map: ${map.modules.length} modules, ${fns} functions, ${map.cycles.length} cycles${map.mutated ? `; mutation from ${map.mutated.sha.slice(0, 7)} (${map.mutated.date}), ${stale} functions stale` : ""}`);
}
