#!/usr/bin/env node
// The destructive-action gate (from dustinedwards.info's check-destructive.mjs, item 51 of the 2026-11-11 shared-code
// audit). Read off the TypeScript syntax tree, so a comment naming a guard never satisfies it. From `.destructive.json`:
//
//   intents   every intent a route `action` branches on is classified destructive or reversible (with the reason), and
//             each destructive branch calls the confirmation predicate inside the action: a guard in an onClick is gone
//             for a reader without JavaScript while the destruction is not.
//   tools     every tool of a machine API (a string array const) is classified, and each destructive tool's descriptor
//             declares a `policy` string, so the refusal is documented before an agent meets it.
//   bindings  a storage binding's deletes and the functions it is handed to:
//             "no-delete"  nothing deletes from it, and each function it is passed to is listed, with the reason it
//                          cannot delete ("file:callee": "reason");
//             "d1-dump"    it is deleted from only through d1-dump's retention and handed only to d1-dump's functions
//                          (or the extra "callees" listed with a reason).
//
// A new intent, tool or call site fails by name until someone has read it; a stale entry fails too. Each scan proves it
// looked (floors) and each binding rule is proven on planted code first.
//
//   npx devkit-destructive                    read .destructive.json
//   npx devkit-destructive --config <file>    another config
//
//   {
//     "intents": { "routes": "app/routes", "predicate": "confirmationSatisfied", "min_files": 34, "min_actions": 12,
//                  "min_intents": 3, "destructive": ["admin.tools.tsx:rebuild"], "reversible": { "x.tsx:y": "why" } },
//     "tools": { "file": "app/lib/operator/descriptors.ts", "list": "TOOLS", "descriptors": "TOOL_DESCRIPTORS",
//                "min": 9, "destructive": ["run_job"], "reversible": { "sync_status": "a read" } },
//     "bindings": [ { "binding": "MEDIA_REVISIONS", "rule": "no-delete", "passed_to": { "app/x.ts:r2Check": "why" } },
//                   { "binding": "BACKUPS", "rule": "d1-dump" } ],
//     "sources": ["app", "workers", "scripts"], "min_sources": 100,
//     "minimum_checks": 81
//   }

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import { fail } from "./annotate.mjs";
import { minimumChecks, readConfig } from "./site-config.mjs";
import { createTally, isMain, walkFiles } from "../node/index.mjs";
import {
  bindingUses,
  findAction,
  intentBranches,
  isLiteralString,
  objectConst,
  parseSource,
  propertyValue,
  stringArrayConst,
  ts,
} from "../node/syntax.mjs";

/**
 * d1-dump's functions a backup bucket may be handed to. runCheckedBackup is dumpDatabase, writeCompleteMarker and
 * pruneDumps in that order and prunes only after the marker; backupFiles removes a copy only 30 days after its source is
 * gone; the health readers read markers and nothing else.
 */
export const D1_DUMP_FUNCTIONS = [
  "dumpDatabase",
  "writeCompleteMarker",
  "pruneDumps",
  "backupHealth",
  "runCheckedBackup",
  "backupFiles",
  "filesHealth",
];

/**
 * How one source reaches a binding, for the rules and their planted proofs.
 *
 * @param {string} binding
 * @param {string} text
 * @param {string} [name]
 */
export function usesOf(binding, text, name = "planted.ts") {
  return bindingUses(parseSource(name, text), binding);
}

/** @param {unknown} reason */
const explained = (reason) => typeof reason === "string" && reason.length > 3;

function main() {
  const argv = process.argv.slice(2);
  const { config } = readConfig(argv, ".destructive.json", "destructive");
  if (!config.intents && !config.tools && !(config.bindings ?? []).length)
    fail(
      "destructive",
      "the config names no intents, tools or bindings, so nothing would be examined",
    );
  const root = process.cwd();
  const tally = createTally({ blankLine: true });
  const { ok } = tally;
  console.log("\ndevkit-destructive\n");

  if (config.intents) {
    const c = config.intents;
    const dir = resolve(c.routes ?? "app/routes");
    if (!existsSync(dir)) fail("destructive", `${c.routes} is missing`);
    const predicate = c.predicate ?? "confirmationSatisfied";
    const destructive = new Set(/** @type {string[]} */ (c.destructive ?? []));
    /** @type {Record<string, string>} */
    const reversible = c.reversible ?? {};
    const files = readdirSync(dir).filter((f) => /\.(tsx?|mjs|js)$/.test(f));
    ok(
      "the route directory yielded files to scan",
      files.length >= (c.min_files ?? 1),
      `found ${files.length}, floor ${c.min_files}; a glob that stops matching reports zero problems`,
    );
    const found = new Set();
    let actions = 0;
    for (const file of files) {
      const action = findAction(parseSource(file, readFileSync(join(dir, file), "utf8")));
      if (!action) continue;
      actions += 1;
      for (const b of intentBranches(action, predicate)) {
        const id = `${file}:${b.intent}`;
        found.add(id);
        if (!destructive.has(id)) continue;
        ok(`${id}: its branch parses`, !b.reason, `${b.reason}, so nothing was examined`);
        if (b.reason) continue;
        ok(
          `${id}: the confirmation is checked in the ACTION`,
          b.guarded,
          `the branch never calls ${predicate}(). A confirmation in an onClick or onSubmit handler is gone for every ` +
            `reader without JavaScript while the destruction is not.`,
        );
      }
    }
    ok(
      "route modules exporting an action were found",
      actions >= (c.min_actions ?? 1),
      `only ${actions}, floor ${c.min_actions}; the action detector stopped matching`,
    );
    ok(
      "the intent vocabulary is non-empty",
      found.size >= (c.min_intents ?? 1),
      `parsed ${found.size} intent(s), floor ${c.min_intents}; every per-intent check is vacuous if this is empty`,
    );
    for (const id of found)
      ok(
        `${id} is classified`,
        destructive.has(id) || id in reversible,
        "an action handles it and nobody has said whether it destroys anything. Add it to destructive (and guard it) " +
          "or to reversible with the reason.",
      );
    for (const id of [...destructive, ...Object.keys(reversible)])
      ok(
        `${id} still exists`,
        found.has(id),
        "classified but no action branches on it; the entry is stale",
      );
    for (const [id, reason] of Object.entries(reversible))
      ok(
        `${id} says why it is reversible`,
        explained(reason),
        "an unexplained entry waves destruction through",
      );
    console.log(
      `  ${actions} action module(s), ${found.size} intent(s), ${destructive.size} destructive`,
    );
  }

  if (config.tools) {
    const c = config.tools;
    const path = resolve(c.file);
    if (!existsSync(path)) fail("destructive", `${c.file} is missing`);
    const tree = parseSource(path, readFileSync(path, "utf8"));
    const names = stringArrayConst(tree, c.list ?? "TOOLS");
    ok(
      `the ${c.list ?? "TOOLS"} list was located`,
      names !== null,
      "every tool would read as classified",
    );
    const tools = names ?? [];
    ok(
      "the tool list parsed",
      tools.length >= (c.min ?? 1),
      `parsed ${tools.length} tool(s), floor ${c.min}. A zero-scope parse agrees with anything.`,
    );
    const destructive = new Set(/** @type {string[]} */ (c.destructive ?? []));
    /** @type {Record<string, string>} */
    const reversible = c.reversible ?? {};
    for (const name of tools)
      ok(
        `tool ${name} is classified`,
        destructive.has(name) || name in reversible,
        "callable by a machine and nobody has said whether it destroys anything. Add it to destructive (with a " +
          "policy in its descriptor) or to reversible with the reason.",
      );
    for (const name of [...destructive, ...Object.keys(reversible)])
      ok(
        `tool classification ${name} still names a live tool`,
        tools.includes(name),
        "the entry is stale",
      );
    for (const [name, reason] of Object.entries(reversible))
      ok(
        `tool ${name} says why it is reversible`,
        explained(reason),
        "an unexplained entry waves destruction through",
      );
    const descriptors = objectConst(tree, c.descriptors ?? "TOOL_DESCRIPTORS");
    ok(
      `the ${c.descriptors ?? "TOOL_DESCRIPTORS"} object was located`,
      descriptors !== null,
      "no descriptor could be examined",
    );
    for (const name of destructive) {
      const entry = descriptors ? propertyValue(descriptors, name) : null;
      const descriptor = entry && ts.isObjectLiteralExpression(entry) ? entry : null;
      ok(
        `${name}: its descriptor was located`,
        descriptor !== null,
        "the check below would examine nothing",
      );
      ok(
        `${name}: declares the policy that refuses it`,
        descriptor !== null && isLiteralString(propertyValue(descriptor, "policy")),
        "a destructive tool with no `policy` is one an agent discovers by being refused",
      );
    }
  }

  const bindings =
    /** @type {Array<{ binding: string, rule: string, passed_to?: Record<string, string>, callees?: Record<string, string> }>} */ (
      config.bindings ?? []
    );
  if (bindings.length > 0) {
    /** @type {string[]} */
    const sources = (config.sources ?? ["app", "workers", "scripts"]).flatMap(
      (/** @type {string} */ d) =>
        existsSync(d)
          ? walkFiles(resolve(d), {
              keep: (n) => /\.(ts|tsx|mjs|js)$/.test(n) && !n.endsWith(".d.ts"),
              skipDir: (n) => n === "node_modules" || n === "dist" || n === "build",
            })
          : [],
    );
    ok(
      "the binding sweep read a non-empty source tree",
      sources.length >= (config.min_sources ?? 1),
      `only ${sources.length} file(s), floor ${config.min_sources}, so a clean result means nothing`,
    );
    const texts = sources.map((file) => ({
      file,
      rel: relative(root, file).split(sep).join("/"),
      text: readFileSync(file, "utf8"),
    }));

    for (const { binding, rule, passed_to: passedTo = {}, callees = {} } of bindings) {
      if (rule !== "no-delete" && rule !== "d1-dump")
        fail("destructive", `${binding}: rule "${rule}" is not no-delete or d1-dump`);
      // A matcher that cannot see the violation agrees with every file, so each is proven on planted code first.
      ok(
        `${binding}: the scan sees a direct delete`,
        usesOf(binding, `await env.${binding}.delete(key);`).deletes.length === 1,
        "it matched nothing, so the sweep would pass over a real delete",
      );
      ok(
        `${binding}: the scan follows a local alias`,
        usesOf(binding, `const b = env.${binding}; await b.delete(key);`).deletes.length === 1,
        `a delete through \`const b = env.${binding}\` would pass unseen`,
      );
      ok(
        `${binding}: the scan sees it handed to a function`,
        usesOf(binding, `await helper(env.${binding});`).passedTo.join() === "helper",
        "the callee rules below would be vacuous",
      );
      ok(
        `${binding}: the scan does not fire on another binding`,
        usesOf(
          binding,
          `await env.${binding}_OTHER.delete(k); await env.OTHER_${binding}.delete(k);`,
        ).mentions === 0,
        "a scan that fires on a look-alike name is unusable",
      );

      let reaching = 0;
      /** @type {string[]} */
      const stray = [];
      const seen = new Set();
      for (const { file, rel, text } of texts) {
        if (!text.includes(binding)) continue;
        const uses = usesOf(binding, text, file);
        if (uses.mentions === 0) continue;
        reaching += 1;
        for (const hit of uses.deletes) stray.push(`${rel}: ${hit}`);
        for (const callee of uses.passedTo) {
          if (rule === "no-delete") {
            const id = `${rel}:${callee}`;
            seen.add(id);
            if (!(id in passedTo)) stray.push(`${rel}: handed to ${callee}, which nobody has read`);
          } else if (!D1_DUMP_FUNCTIONS.includes(callee) && !(callee in callees)) {
            stray.push(`${rel}: handed to ${callee}`);
          } else {
            seen.add(callee);
          }
        }
      }
      ok(
        `${binding}: at least one source file reaches it`,
        reaching > 0,
        "no file names it, so this rule watches a binding that no longer exists",
      );
      ok(
        rule === "no-delete"
          ? `${binding}: nothing deletes from it, and every function handed it has been read`
          : `${binding}: deleted from only through d1-dump, and handed only to d1-dump's functions`,
        stray.length === 0,
        `${stray.join(" | ")}. Read the callee, then list it with the reason it cannot delete.`,
      );
      const listed = rule === "no-delete" ? passedTo : callees;
      for (const [id, reason] of Object.entries(listed)) {
        ok(`${binding}: ${id} is still handed it`, seen.has(id), "the entry is stale");
        ok(
          `${binding}: ${id} says why`,
          explained(reason),
          "an unexplained entry is permission nobody audits",
        );
      }
      console.log(`  ${binding}: ${reaching} file(s) reach it, ${stray.length} stray use(s)`);
    }
  }

  tally.floor("devkit-destructive", "checks", minimumChecks("destructive", config));
  console.log(
    `\n${tally.checks} checks, ${tally.failures} failure${tally.failures === 1 ? "" : "s"}\n`,
  );
  process.exit(tally.failures > 0 ? 1 : 0);
}

if (isMain(import.meta.url)) main();
