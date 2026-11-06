import assert from "node:assert/strict";
import test from "node:test";

import { isSource, isWholeFile, sameFiles, sharedNames } from "../bin/copies.mjs";

test("PLANT: a name two sites each define is counted; a re-export, a Drizzle table, a route export and a shared package's own are not", () => {
  const files = [
    { repo: "germomics", path: "app/lib/email.server.ts", text: "export async function sendEmail(env, m) {}\nexport const mediaUploads = sqliteTable(\"media\", {});\n" },
    { repo: "txasm", path: "app/lib/email.server.ts", text: "export const sendEmail = async () => {};\nexport const mediaUploads = sqliteTable(\"media\", {});\n" },
    { repo: "foxhound", path: "app/lib/mail.ts", text: 'export { sendEmail } from "@dustinedwards/site-runtime/email";\nexport async function clientLoader() {}\n' },
    { repo: "site-runtime", path: "email.mjs", text: "export async function sendEmail() {}\n" },
    { repo: "carrel", path: "app/routes/a.tsx", text: "export async function clientLoader() {}\n" },
  ];
  assert.deepEqual(sharedNames(files), [{ name: "sendEmail", places: [{ repo: "germomics", path: "app/lib/email.server.ts" }, { repo: "txasm", path: "app/lib/email.server.ts" }] }]);
});

test("PLANT: .claude and .github code is scanned; a .claude Markdown file in two repositories is the same file; settings are not", () => {
  assert.equal(isSource(".claude/hooks/no-em-dash.sh"), true);
  assert.equal(isSource(".github/scripts/check.mjs"), true);
  assert.equal(isSource(".vscode/tasks.js"), false);
  assert.equal(isWholeFile(".claude/skills/ship/SKILL.md"), true);
  assert.equal(isWholeFile(".claude/settings.json"), false);
  const same = sameFiles([
    { repo: "a", path: ".claude/rules/deploy.md", hash: "1" },
    { repo: "b", path: ".claude/rules/ship.md", hash: "1" },
    { repo: "b", path: ".claude/rules/other.md", hash: "2" },
  ]);
  assert.deepEqual(same, [[{ repo: "a", path: ".claude/rules/deploy.md" }, { repo: "b", path: ".claude/rules/ship.md" }]]);
});
