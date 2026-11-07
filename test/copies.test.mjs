import assert from "node:assert/strict";
import test from "node:test";

import { sharedNames } from "../bin/copies.mjs";

test("PLANT: a name two sites each define is counted; a re-export, a Drizzle table, a route export and a shared package's own are not", () => {
  const files = [
    {
      repo: "germomics",
      path: "app/lib/email.server.ts",
      text: 'export async function sendEmail(env, m) {}\nexport const mediaUploads = sqliteTable("media", {});\n',
    },
    {
      repo: "txasm",
      path: "app/lib/email.server.ts",
      text: 'export const sendEmail = async () => {};\nexport const mediaUploads = sqliteTable("media", {});\n',
    },
    {
      repo: "foxhound",
      path: "app/lib/mail.ts",
      text: 'export { sendEmail } from "@dustinedwards/site-runtime/email";\nexport async function clientLoader() {}\n',
    },
    { repo: "site-runtime", path: "email.mjs", text: "export async function sendEmail() {}\n" },
    { repo: "carrel", path: "app/routes/a.tsx", text: "export async function clientLoader() {}\n" },
  ];
  assert.deepEqual(sharedNames(files), [
    {
      name: "sendEmail",
      places: [
        { repo: "germomics", path: "app/lib/email.server.ts" },
        { repo: "txasm", path: "app/lib/email.server.ts" },
      ],
    },
  ]);
  const shared = [
    { repo: "site-api", path: "src/frontmatter.ts", text: "export function splitSource() {}\n" },
    { repo: "prelum", path: "frontmatter.mjs", text: "export function splitSource() {}\n" },
    { repo: "germomics", path: "app/lib/a.ts", text: "export function splitSource() {}\n" },
    { repo: "txasm", path: "app/lib/a.ts", text: "export function splitSource() {}\n" },
  ];
  // With packages: only the names two shared packages each export, not the sites' own definitions.
  assert.deepEqual(sharedNames(shared, true), [
    {
      name: "splitSource",
      places: [
        { repo: "prelum", path: "frontmatter.mjs" },
        { repo: "site-api", path: "src/frontmatter.ts" },
      ],
    },
  ]);
  assert.equal(sharedNames(shared).length, 1);
});
