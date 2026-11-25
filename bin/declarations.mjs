#!/usr/bin/env node
// The declaration gate: a package's public types can be kept by a project whose tsconfig is `composite`. A function that
// returns a type its entry point does not export has declarations that typecheck for the package itself, and fail the
// consumer's declaration emit with TS2883 ("cannot be named without a reference to ...") (Prelum 0.68.0's SchemaNode,
// site-runtime 0.182.0's ImagesLike, both defined in a module the package's `exports` leave out).
//
//   npx devkit-declarations
//
// Run it in a package's root after its declarations are built (`npm run prepare`). It packs the package, installs the
// tarball in a temporary folder beside links to the repo's other dependencies (inside the repo, the package's own name
// resolves to its source, not the tarball), and typechecks one generated file with `composite` and `declaration`
// on: for every function an `exports` entry with `types` exports, a constant holding its return type and one holding
// its parameters, and a constant for every other export. An entry the package cannot load in Node is reported and
// skipped; only TS2883 fails the run: the
// other errors come from the project the package is used in (ambient Workers types, optional peers).

import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { isMain } from "../node/index.mjs";
import { escapeAnnotation, fail } from "./annotate.mjs";

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** The `exports` subpaths that carry types, as `{ subpath, types }`. */
export function typedEntries(/** @type {Record<string, any>} */ pkg) {
  return Object.entries(pkg.exports ?? {})
    .filter(([, target]) => target && typeof target === "object" && target.types)
    .map(([subpath, target]) => ({ subpath, types: String(target.types) }));
}

/** The fixture's source: one import per entry, and the constants that make the compiler name every public type. */
export function fixtureSource(
  /** @type {string} */ name,
  /** @type {Array<{ subpath: string, members: Array<{ name: string, isFunction: boolean }> }>} */ entries,
) {
  const lines = [];
  entries.forEach(({ subpath, members }, i) => {
    lines.push(`import * as m${i} from ${JSON.stringify(name + subpath.slice(1))};`);
    for (const { name: member, isFunction } of members) {
      if (!IDENTIFIER.test(member) || member === "default") continue;
      const id = `${subpath.slice(2).replace(/\W/g, "_") || "root"}__${member}`;
      if (isFunction) {
        lines.push(
          `export const ${id}_return = (null as unknown as typeof m${i}.${member})(...(null as unknown as Parameters<typeof m${i}.${member}>));`,
        );
      } else lines.push(`export const ${id} = m${i}.${member};`);
    }
  });
  return `${lines.join("\n")}\nexport {};\n`;
}

/** Links every installed package of `from` into `to`, except `skip` (the package under test, which `to` gets from the tarball). */
function linkDependencies(
  /** @type {string} */ from,
  /** @type {string} */ to,
  /** @type {string} */ skip,
) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from)) {
    if (entry.startsWith(".")) continue;
    if (entry.startsWith("@")) {
      mkdirSync(join(to, entry), { recursive: true });
      for (const child of readdirSync(join(from, entry))) {
        if (`${entry}/${child}` !== skip)
          symlinkSync(join(from, entry, child), join(to, entry, child));
      }
    } else if (entry !== skip) symlinkSync(join(from, entry), join(to, entry));
  }
}

async function main() {
  const root = process.cwd();
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const entries = typedEntries(pkg);
  if (entries.length === 0) fail("declarations", `${pkg.name} has no exports entry with types`);

  const work = mkdtempSync(join(tmpdir(), "declarations-"));
  try {
    const packed = JSON.parse(
      execFileSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", work], {
        cwd: root,
        encoding: "utf8",
      }),
    );
    linkDependencies(join(root, "node_modules"), join(work, "node_modules"), pkg.name);
    const installed = join(work, "node_modules", ...pkg.name.split("/"));
    mkdirSync(installed, { recursive: true });
    execFileSync("tar", [
      "-xzf",
      join(work, packed[0].filename),
      "-C",
      installed,
      "--strip-components=1",
    ]);

    const loaded = [];
    for (const { subpath } of entries) {
      try {
        const mod = await import(
          pathToFileURL(join(installed, String(pkg.exports[subpath].default))).href
        );
        loaded.push({
          subpath,
          members: Object.entries(mod).map(([name, value]) => ({
            name,
            isFunction:
              typeof value === "function" &&
              !/^class\b/.test(Function.prototype.toString.call(value)),
          })),
        });
      } catch (error) {
        console.log(
          `::warning::declarations: ${escapeAnnotation(`${pkg.name}${subpath.slice(1)} did not load in Node, so its types are not checked (${/** @type {Error} */ (error).message})`)}`,
        );
      }
    }

    writeFileSync(join(work, "fixture.ts"), fixtureSource(pkg.name, loaded));
    writeFileSync(
      join(work, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          composite: true,
          declaration: true,
          emitDeclarationOnly: true,
          outDir: "out",
          strict: true,
          skipLibCheck: true,
          module: "es2022",
          moduleResolution: "bundler",
          target: "es2022",
          lib: ["es2023", "dom", "dom.iterable"],
          types: [],
        },
        files: ["fixture.ts"],
      }),
    );
    const tsc = join(root, "node_modules", ".bin", "tsc");
    try {
      execFileSync(tsc, ["-p", work], { cwd: root, encoding: "utf8", stdio: "pipe" });
    } catch (error) {
      const out = /** @type {{ stdout?: string }} */ (error).stdout ?? String(error);
      const lines = out.split("\n").filter((line) => line.includes("error TS2883"));
      if (lines.length > 0) {
        console.log(
          `::error::${escapeAnnotation(`declarations: a project with a composite tsconfig cannot keep ${pkg.name}'s types:\n${lines.slice(0, 20).join("\n")}\nExport each named type from the entry point that uses it.`)}`,
        );
        process.exitCode = 1;
        return;
      }
    }
    console.log(
      `declarations: ${pkg.name}: ${loaded.length} of ${entries.length} entries typecheck under a composite tsconfig`,
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (isMain(import.meta.url)) await main();
