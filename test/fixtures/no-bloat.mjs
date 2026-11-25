// Fixtures shared by the no-bloat tests: a fake runner and a scratch git repository with stand-in tools.

import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const BIN = fileURLToPath(new URL("../../bin/no-bloat.mjs", import.meta.url));
export const YAML_DIR = fileURLToPath(new URL("../../node_modules/yaml", import.meta.url));
export const { parse: parseYaml } = await import("yaml");

export const KNIP = JSON.stringify({
  issues: [
    { file: "src/a.ts", files: [{ name: "src/a.ts" }], exports: [] },
    { file: "src/b.ts", files: [{ name: "src/b.ts" }] },
    { file: "src/c.ts", exports: [{ name: "x" }, { name: "y" }, { name: "z" }] },
  ],
});

/** The legacy scanner's JSON report: three matches over two guides. */
export const LEGACY = JSON.stringify({
  totalFindings: 3,
  guides: [
    { guideId: "dialog", count: 2, rules: [] },
    { guideId: "dark-mode", count: 1, rules: [] },
  ],
});

/** A runner that answers knip with `knip` and writes a jscpd report with `clones` into the --output directory. */
export const fakeRun = ({ knip = KNIP, clones = 4, percentage = 1.234, sources = 9 } = {}) => {
  /** @type {Array<[string, string[]]>} */
  const calls = [];
  /** @type {import("../../bin/no-bloat/scan.mjs").Runner} */
  const run = (name, args) => {
    calls.push([name, args]);
    if (name === "knip") return knip;
    if (name === "modern-web-guidance") return LEGACY;
    const out = args[args.indexOf("--output") + 1];
    writeFileSync(
      join(out, "jscpd-report.json"),
      JSON.stringify({
        statistics: {
          total: { clones, duplicatedLines: 40, percentage, sources },
          formats: {
            javascript: {
              sources: Object.fromEntries(
                Array.from({ length: sources }, (_, i) => [`f${i}.js`, {}]),
              ),
            },
          },
        },
      }),
    );
    return "";
  };
  return { run, calls };
};

export function scratch({ knip = KNIP, clones = 4, jscpdFails = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "no-bloat-"));
  git(dir, "init", "-q", "-b", "main");
  writeFileSync(join(dir, ".gitignore"), "node_modules/\nsummary.md\n");
  const bin = join(dir, "node_modules", ".bin");
  mkdirSync(bin, { recursive: true });
  for (const name of ["knip", "jscpd", "modern-web-guidance"]) {
    writeFileSync(join(bin, name), "#!/bin/sh\necho '{\"issues\":[]}'\nexit 9\n");
    chmodSync(join(bin, name), 0o755);
    mkdirSync(join(dir, "node_modules", ".tools", "node_modules", name), { recursive: true });
    writeFileSync(
      join(dir, "node_modules", ".tools", "node_modules", name, "package.json"),
      JSON.stringify({ name, type: "module", bin: { [name]: "bin.mjs" } }),
    );
  }
  // The real YAML parser, and a Knip plugin list of one: Mocha's config files.
  symlinkSync(YAML_DIR, join(dir, "node_modules", ".tools", "node_modules", "yaml"), "dir");
  const plugins = join(dir, "node_modules", ".tools", "node_modules", "knip", "dist", "plugins");
  mkdirSync(plugins, { recursive: true });
  writeFileSync(
    join(plugins, "index.js"),
    'export const Plugins = { mocha: { config: [".mocharc.{js,cjs,mjs,json}", "package.json"] } };\n',
  );
  writeFileSync(
    tool(dir, "knip"),
    `if (process.argv.includes("--fail")) { console.error("knip: boom"); process.exit(2); }\nprocess.stdout.write(${JSON.stringify(knip)});\n`,
  );
  writeFileSync(
    tool(dir, "modern-web-guidance"),
    `process.stdout.write(${JSON.stringify(LEGACY)});\n`,
  );
  writeFileSync(
    tool(dir, "jscpd"),
    jscpdFails
      ? 'console.error("jscpd: boom");\nprocess.exit(3);\n'
      : // It reads every file git lists, so none is unread.
        `import { execFileSync } from "node:child_process";\nimport { writeFileSync } from "node:fs";\nconst out = process.argv[process.argv.indexOf("--output") + 1];\nconst sources = Object.fromEntries(execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\\n").filter(Boolean).map((p) => [p, {}]));\nwriteFileSync(out + "/jscpd-report.json", JSON.stringify({ statistics: { total: { clones: ${clones}, duplicatedLines: 30, percentage: 2.5, sources: Object.keys(sources).length }, formats: { javascript: { sources } } } }));\n`,
  );
  return dir;
}

/** A stand-in tool's script in a scratch repository. */
export const tool = (/** @type {string} */ dir, /** @type {string} */ name) =>
  join(dir, "node_modules", ".tools", "node_modules", name, "bin.mjs");

export const git = (/** @type {string} */ cwd, /** @type {string[]} */ ...args) =>
  execFileSync("git", ["-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "T",
      GIT_AUTHOR_EMAIL: "t@example.com",
      GIT_COMMITTER_NAME: "T",
      GIT_COMMITTER_EMAIL: "t@example.com",
    },
  });

export const runBin = (/** @type {string} */ cwd, /** @type {string[]} */ args = [], env = {}) =>
  spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_STEP_SUMMARY: "",
      GITHUB_ACTIONS: "true",
      // A scratch repository is counted as its working tree, not as the commit of the run these tests run in.
      GITHUB_SHA: "",
      DEVKIT_NO_BLOAT_TOOLS: join(cwd, "node_modules", ".tools"),
      ...env,
    },
  });
