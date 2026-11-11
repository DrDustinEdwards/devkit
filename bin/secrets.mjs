#!/usr/bin/env node
// The secrets gate (from dustinedwards.info's check-secrets.mjs, item 51 of the 2026-11-11 shared-code audit). It proves,
// from the repository's `.secrets.json`:
//
//   1. every secret the site names is declared on its Env interface (and, with "env_exact", nothing else is);
//   2. no secret is read outside the server boundary (a `*.server.*` module or workers/, by default), read off the syntax
//      tree so `env.X`, `getEnv(c).X`, `env["X"]` and `const { X } = env` all count and a comment or a key does not;
//   3. git itself ignores the credential files (`.dev.vars` always);
//   4. no tracked file carries anything shaped like a live credential (built-in shapes plus the repository's own), or the
//      verbatim value of a `.dev.vars` credential named in "dev_var_values".
//
// Every scan proves it looked: a floor per root, reads found inside the boundary, a non-empty tracked tree, and a floor on
// the checks run. A git that cannot answer fails closed.
//
//   npx devkit-secrets                      read .secrets.json
//   npx devkit-secrets --config <file>      another config
//
// The config:
//
//   {
//     "secrets": ["OPERATOR_TOKEN", ...],          or "secrets_module": "app/lib/secrets.mjs#REQUIRED_SECRETS"
//     "env_types": "app/env.d.ts", "env_interface": "Env", "env_exact": true,
//     "roots": { "app": 145, "workers": 3 },       each scanned root and the fewest files it may yield
//     "server_only": ["^workers/", "\\.server\\.(ts|tsx|mjs|js)$"],
//     "client_allowed": { "NAME": "why a client module may read it, over 20 characters" },
//     "ignored": [".smoke-token"],                 credential files git must ignore, beside .dev.vars
//     "shapes": { "an UptimeRobot API key": "u\\d{4,12}-[A-Za-z0-9]{16,64}" },
//     "shape_allow": { "test/fixtures/fake-key.txt": "why this file may hold one" },
//     "dev_var_values": ["CLOUDFLARE_API_TOKEN"],
//     "minimum_checks": 29
//   }

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { escapeAnnotation } from "./annotate.mjs";
import { createTally, readDevVar, walkFiles } from "../node/index.mjs";

/**
 * Shapes of live credentials that never belong in git, whatever the site. Each needs enough length after its prefix that a
 * placeholder like `sk-ant-...` in a README does not fire.
 */
export const BUILT_IN_SHAPES = {
  "an Anthropic API key": /sk-ant-[A-Za-z0-9_-]{32,}/,
  "a Stripe live secret or restricted key": /\b[sr]k_live_[A-Za-z0-9]{20,}/,
  "a Stripe webhook signing secret": /\bwhsec_[A-Za-z0-9]{24,}/,
  "a GitHub token": /\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{60,})/,
  "an AWS access key id": /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  "a Sentry auth token": /\bsntr[ysu]_[A-Za-z0-9+/=_-]{40,}/,
  "a private key": /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/,
};

/**
 * The credential shapes found in one file's text.
 *
 * @param {string} text
 * @param {Record<string, RegExp>} shapes
 * @returns {string[]} the names of the shapes that matched
 */
export function shapesIn(text, shapes) {
  return Object.entries(shapes)
    .filter(([, re]) => re.test(text))
    .map(([name]) => name);
}

/**
 * The problems with one client_allowed entry, so the rules can be exercised on synthetic input.
 *
 * @param {string[]} secrets
 * @param {string} name
 * @param {unknown} reason
 */
export function allowlistProblems(secrets, name, reason) {
  const problems = [];
  if (!secrets.includes(name)) problems.push("names something the secret list does not");
  if (typeof reason !== "string" || reason.length <= 20)
    problems.push("carries no stated reason, so it is permission nobody can review");
  return problems;
}

/** @param {string} root @param {string} path */
function gitIgnores(root, path) {
  const res = spawnSync("git", ["check-ignore", "-q", "--no-index", path], {
    cwd: root,
    encoding: "utf8",
  });
  // 0 ignored, 1 not ignored, anything else is git failing to answer; reading that as "ignored" would fail open.
  if (res.status !== 0 && res.status !== 1)
    throw new Error(`git check-ignore could not answer for ${path} (status ${res.status})`);
  return res.status === 0;
}

async function main() {
  const argv = process.argv.slice(2);
  const at = argv.indexOf("--config");
  const configPath = resolve(at >= 0 ? argv[at + 1] : ".secrets.json");
  /** @param {string} m @returns {never} */
  const die = (m) => {
    console.error(`::error::secrets: ${escapeAnnotation(m)}`);
    process.exit(1);
  };
  if (!existsSync(configPath)) die(`no ${relative(process.cwd(), configPath)}; refusing to pass`);
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  const root = process.cwd();

  /** @type {string[]} */
  let secrets = config.secrets;
  if (config.secrets_module) {
    const [file, name = "REQUIRED_SECRETS"] = String(config.secrets_module).split("#");
    secrets = (await import(pathToFileURL(resolve(file)).href))[name];
  }
  if (!Array.isArray(secrets)) die('name the secrets with "secrets" or "secrets_module"');
  const roots = /** @type {Record<string, number>} */ (config.roots ?? {});
  if (Object.keys(roots).length === 0) die('"roots" names no directory to scan');
  /** @type {RegExp[]} */
  const serverOnly = (config.server_only ?? ["^workers/", "\\.server\\.(ts|tsx|mjs|js)$"]).map(
    (/** @type {string} */ p) => new RegExp(p),
  );
  /** @type {Record<string, string>} */
  const clientAllowed = config.client_allowed ?? {};
  /** @type {Record<string, RegExp>} */
  const shapes = { ...BUILT_IN_SHAPES };
  for (const [name, pattern] of Object.entries(config.shapes ?? {}))
    shapes[name] = new RegExp(String(pattern));
  /** @type {Record<string, string>} */
  const shapeAllow = config.shape_allow ?? {};

  const tally = createTally();
  const { ok } = tally;
  console.log("\ndevkit-secrets\n");

  ok(
    "the secret list is not empty",
    secrets.length > 0,
    "with no secrets named, every assertion below would pass by examining nothing",
  );

  // 1. A secret nobody declared is a secret nobody reviewed.
  if (config.env_types) {
    const { interfaceMembers, parseSource } = await import("../node/syntax.mjs");
    const envPath = resolve(config.env_types);
    if (!existsSync(envPath))
      die(`${config.env_types} is missing; the declaration check cannot run`);
    const iface = config.env_interface ?? "Env";
    const env = interfaceMembers(parseSource(envPath, readFileSync(envPath, "utf8")), iface);
    ok(
      `${config.env_types} declares an ${iface} interface`,
      env.found,
      "not found, so the declaration checks would examine nothing",
    );
    for (const name of secrets)
      ok(
        `${name} is declared in ${config.env_types}`,
        env.members.has(name),
        "the site names it as a secret and the Env type does not carry it",
      );
    if (config.env_exact)
      for (const name of env.members)
        ok(
          `${name} is a named secret`,
          secrets.includes(name),
          `${config.env_types} declares it and the secret list does not. Add it there in the same commit, or remove it here.`,
        );
  }

  // 2. Reads outside the server boundary.
  const { parseSource, propertyReads } = await import("../node/syntax.mjs");
  /** @type {string[]} */
  const files = [];
  for (const [dir, min] of Object.entries(roots)) {
    const here = existsSync(dir)
      ? walkFiles(resolve(dir), {
          keep: (n) => /\.(ts|tsx|mjs|js|jsx)$/.test(n) && !n.endsWith(".d.ts"),
          skipDir: (n) => n === "node_modules" || n === "build" || n === "dist",
        })
      : [];
    files.push(...here);
    ok(
      `the scan examined ${dir}/, and to depth`,
      here.length >= min,
      `${here.length} file(s) under ${dir}/, expected at least ${min}. The walk stopped matching this tree, or the root moved.`,
    );
  }
  const names = new Set(secrets);
  let reads = 0;
  let serverReads = 0;
  /** @type {string[]} */
  const violations = [];
  for (const file of files) {
    const path = relative(root, file).split(sep).join("/");
    const isServer = serverOnly.some((re) => re.test(path));
    for (const { name, line } of propertyReads(
      parseSource(file, readFileSync(file, "utf8")),
      names,
    )) {
      reads += 1;
      if (isServer) serverReads += 1;
      else if (!clientAllowed[name]) violations.push(`${path}:${line} reads ${name}`);
    }
  }
  // A broken matcher finds zero reads and zero violations, which looks the same as a clean repository.
  ok(
    "the scan found secret reads to classify",
    reads > 0 && serverReads > 0,
    `${reads} read(s), ${serverReads} inside the server boundary. Zero means the matcher is broken, not that the repository is clean.`,
  );
  ok(
    "no secret is read outside the server boundary",
    violations.length === 0,
    violations.join("\n        "),
  );
  for (const [name, reason] of Object.entries(clientAllowed)) {
    const problems = allowlistProblems(secrets, name, reason);
    ok(`client_allowed ${name} is acceptable`, problems.length === 0, problems.join("; "));
  }

  // 3. Credential files git must ignore. Asks git: a line in .gitignore is not the same as a matching rule.
  for (const path of [".dev.vars", ...(config.ignored ?? [])])
    ok(
      `git ignores ${path}`,
      gitIgnores(root, path),
      `${path} is NOT ignored, so a credential in it is one \`git add\` away from being published`,
    );

  // 4. Every tracked file under 2 MB, for credential shapes and for the verbatim .dev.vars values.
  const ls = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" });
  if (ls.status !== 0) die(`git ls-files could not answer (status ${ls.status})`);
  const tracked = ls.stdout.split("\0").filter(Boolean);
  ok(
    "the tracked-file scan has a non-empty scope",
    tracked.length > 0,
    "git ls-files returned nothing, so a clean sweep would mean nothing",
  );
  /** @type {Array<[string, string]>} */
  const values = [];
  for (const name of config.dev_var_values ?? []) {
    const value = readDevVar(name, { root });
    // Guarded on length: an empty value matches every file.
    if (value && value.length >= 12) values.push([name, value]);
  }
  /** @type {string[]} */
  const shapeHits = [];
  /** @type {string[]} */
  const valueHits = [];
  /** @type {string[]} */
  const unreadable = [];
  let scanned = 0;
  for (const rel of tracked) {
    const full = join(root, rel);
    if (!existsSync(full)) continue;
    const st = statSync(full);
    if (!st.isFile() || st.size >= 2_000_000) continue;
    let text;
    try {
      text = readFileSync(full, "utf8");
    } catch (error) {
      unreadable.push(`${rel} (${/** @type {NodeJS.ErrnoException} */ (error).code ?? error})`);
      continue;
    }
    scanned += 1;
    if (!shapeAllow[rel])
      for (const shape of shapesIn(text, shapes)) shapeHits.push(`${rel} (${shape})`);
    for (const [name, value] of values)
      if (text.includes(value)) valueHits.push(`${rel} (${name})`);
  }
  ok(
    "every tracked file in scope was read",
    unreadable.length === 0,
    `${unreadable.join(", ")}. An unread file reported clean is a scan that never looked.`,
  );
  ok(
    "no tracked file carries anything shaped like a credential",
    shapeHits.length === 0,
    `${shapeHits.join(", ")}. Rotate it, then replace it with a placeholder.`,
  );
  ok(
    "no tracked file carries a .dev.vars credential verbatim",
    valueHits.length === 0,
    `${valueHits.join(", ")}. Rotate it, then read it through readDevVar().`,
  );
  for (const [rel, reason] of Object.entries(shapeAllow))
    ok(
      `shape_allow ${rel} is still tracked and says why`,
      tracked.includes(rel) && typeof reason === "string" && reason.length > 20,
      "a stale or unexplained exception is permission nobody audits",
    );

  console.log(
    `  ${secrets.length} secret(s), ${files.length} source file(s), ${reads} read(s), ${scanned} tracked file(s) scanned, ` +
      `.dev.vars ${values.length > 0 ? "present" : "absent"}`,
  );
  const minimum = Number(config.minimum_checks);
  if (!Number.isInteger(minimum) || minimum < 1) die('"minimum_checks" must be a positive integer');
  tally.floor("devkit-secrets", "checks", minimum);
  if (tally.failures > 0) {
    console.log(`\n${tally.failures} FAILED of ${tally.checks} checks\n`);
    process.exit(1);
  }
  console.log(`\n${tally.checks} checks, 0 failures\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href)
  await main();
