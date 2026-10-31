#!/usr/bin/env node
// Writes test/fixtures/fakes-contract.json: what the real services publish about the routes devkit's fakes serve. For
// GitHub, each operation's success status and every field path its response schema allows, from GitHub's OpenAPI
// description at a pinned commit. For Cloudflare Access, the application token's claims with their JSON types and the
// certs endpoint's fields, from the example payloads in Cloudflare's docs. test/testing-contract.test.mjs holds the
// fakes to it. Run by hand when either source moves: `npm run contract [-- <rest-api-description commit>]`.

import { writeFileSync } from "node:fs";

const COMMIT = process.argv[2] ?? "066b825d08409eb6c48ddfdd7547c0b70a72dfaf";
const OPENAPI = `https://raw.githubusercontent.com/github/rest-api-description/${COMMIT}/descriptions/api.github.com/api.github.com.json`;
const DOCS = "https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie";
const OPERATIONS = [
  ["get", "/repos/{owner}/{repo}/git/ref/{ref}"],
  ["get", "/repos/{owner}/{repo}/git/commits/{commit_sha}"],
  ["get", "/repos/{owner}/{repo}/contents/{path}"],
  ["get", "/repos/{owner}/{repo}/commits"],
  ["post", "/repos/{owner}/{repo}/git/blobs"],
  ["post", "/repos/{owner}/{repo}/git/trees"],
  ["post", "/repos/{owner}/{repo}/git/commits"],
  ["patch", "/repos/{owner}/{repo}/git/refs/{ref}"],
];

async function get(/** @type {string} */ url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.text();
}

const spec = JSON.parse(await get(OPENAPI));
const deref = (/** @type {any} */ node) => (node?.$ref ? deref(node.$ref.slice(2).split("/").reduce((/** @type {any} */ at, /** @type {string} */ key) => at[key], spec)) : node);

/** Every field path a schema allows: `a`, `a.b`, `list[].c`, and `[].c` for a top-level array's items. */
function fieldPaths(/** @type {any} */ schema, prefix = "", depth = 0, out = new Set()) {
  const node = deref(schema);
  if (!node || depth > 4) return out;
  for (const variant of [...(node.oneOf ?? []), ...(node.anyOf ?? []), ...(node.allOf ?? [])]) fieldPaths(variant, prefix, depth, out);
  if (node.items) fieldPaths(node.items, `${prefix}[]`, depth, out);
  for (const [name, property] of Object.entries(node.properties ?? {})) {
    const path = prefix ? `${prefix}.${name}` : name;
    out.add(path);
    fieldPaths(property, path, depth + 1, out);
  }
  return out;
}

const operations = Object.fromEntries(
  OPERATIONS.map(([method, path]) => {
    const operation = spec.paths[path][method];
    const status = Object.keys(operation.responses).find((code) => code.startsWith("2"));
    const schema = deref(operation.responses[status]).content["application/json"].schema;
    return [operation.operationId, { method: method.toUpperCase(), path, status: Number(status), fields: [...fieldPaths(schema)].sort() }];
  }),
);

/** The first JSON code block after `heading` in a docs page's Markdown. */
async function example(/** @type {string} */ page, /** @type {string} */ heading) {
  const text = await get(`${DOCS}/${page}/index.md`);
  const block = text.slice(text.indexOf(heading)).match(/```(?:json|txt)\n([\s\S]*?)```/)?.[1];
  if (!block) throw new Error(`no example after "${heading}" in ${page}`);
  return JSON.parse(block);
}

const typeOf = (/** @type {unknown} */ value) => (Array.isArray(value) ? "array" : typeof value);
const token = await example("application-token", "### Identity-based authentication");
const certs = await example("validating-json", "contains two public keys");

const contract = {
  github: { source: OPENAPI, operations },
  access: {
    source: [`${DOCS}/application-token/`, `${DOCS}/validating-json/`],
    applicationToken: Object.fromEntries(Object.entries(token).map(([claim, value]) => [claim, typeOf(value)])),
    certs: {
      fields: Object.keys(certs),
      keys: certs.keys.length,
      key: Object.keys(certs.keys[0]),
      cert: Object.keys(certs.public_cert),
    },
  },
};
writeFileSync(new URL("../test/fixtures/fakes-contract.json", import.meta.url), `${JSON.stringify(contract, null, 2)}\n`);
