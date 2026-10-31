import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import test from "node:test";

import { stubAccess } from "@dustinedwards/devkit/access";
import { stubGitHub } from "@dustinedwards/devkit/github";

// What GitHub and Cloudflare publish, extracted by scripts/fakes-contract.mjs. A fake answering another status, or a
// field the real service never sends, lets a test pass that fails against the real one.
const contract = JSON.parse(readFileSync(new URL("fixtures/fakes-contract.json", import.meta.url), "utf8"));

/** Every field path in a JSON value, written as the extract writes them. */
function fieldPaths(value, prefix = "", out = new Set()) {
  if (Array.isArray(value)) for (const item of value) fieldPaths(item, `${prefix}[]`, out);
  else if (value && typeof value === "object") {
    for (const [name, child] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${name}` : name;
      out.add(path);
      fieldPaths(child, path, out);
    }
  }
  return out;
}

test("the GitHub fake answers each operation with GitHub's status and only fields GitHub's schema has", async (t) => {
  const gh = stubGitHub({ owner: "Owner", repo: "site", files: { "a.md": "a", "dir/b.md": "b" } });
  t.after(gh.restore);
  gh.history.push({ sha: "f".repeat(40), message: "m", author: "A", date: "2026-10-01T00:00:00Z" });
  const API = "https://api.github.com/repos/Owner/site";
  const call = async (operationId, path, init) => {
    const response = await fetch(`${API}${path}`, init && { ...init, body: JSON.stringify(init.body) });
    const body = await response.json();
    const { status, fields } = contract.github.operations[operationId];
    assert.equal(response.status, status, `${operationId}: ${JSON.stringify(body)}`);
    const unknown = [...fieldPaths(body)].filter((field) => !fields.includes(field));
    assert.deepEqual(unknown, [], `${operationId} answers fields GitHub does not`);
    return body;
  };

  const head = (await call("git/get-ref", "/git/ref/heads/main")).object.sha;
  const { tree } = await call("git/get-commit", `/git/commits/${head}`);
  await call("repos/get-content", "/contents/a.md");
  await call("repos/get-content", "/contents/dir");
  await call("repos/list-commits", "/commits?path=a.md");
  const blob = await call("git/create-blob", "/git/blobs", { method: "POST", body: { content: "c" } });
  const next = await call("git/create-tree", "/git/trees", { method: "POST", body: { base_tree: tree.sha, tree: [{ path: "c.md", mode: "100644", type: "blob", sha: blob.sha }] } });
  const commit = await call("git/create-commit", "/git/commits", { method: "POST", body: { message: "m", tree: next.sha, parents: [head] } });
  await call("git/update-ref", "/git/refs/heads/main", { method: "PATCH", body: { sha: commit.sha } });
});

test("the Access fake's application token carries Cloudflare's claims, and its certs Cloudflare's fields", async () => {
  const certsUrl = "https://sample.cloudflareaccess.com/cdn-cgi/access/certs";
  const stub = await stubAccess({ issuer: "https://sample.cloudflareaccess.com", audience: "aud-tag", email: "x@example.com", jwksUrl: certsUrl, install: false });
  const claims = JSON.parse(Buffer.from((await stub.token()).split(".")[1], "base64url").toString("utf8"));
  const types = Object.fromEntries(Object.entries(claims).map(([claim, value]) => [claim, Array.isArray(value) ? "array" : typeof value]));
  assert.deepEqual(types, contract.access.applicationToken);

  const certs = await (await stub.fetch(certsUrl)).json();
  const { fields, keys, key, cert } = contract.access.certs;
  assert.deepEqual(Object.keys(certs), fields);
  assert.equal(certs.keys.length, keys);
  for (const jwk of certs.keys) assert.deepEqual(Object.keys(jwk), key);
  assert.deepEqual(Object.keys(certs.public_cert), cert);
  assert.equal(certs.public_cert.kid, stub.jwk.kid);
  // Each PEM is a certificate for the key of the same kid, as a verifier matching kid in public_certs reads it.
  for (const [i, entry] of certs.public_certs.entries()) {
    assert.deepEqual(Object.keys(entry), cert);
    assert.equal(entry.kid, certs.keys[i].kid);
    assert.equal(new X509Certificate(entry.cert).publicKey.export({ format: "jwk" }).n, certs.keys[i].n);
  }
});
