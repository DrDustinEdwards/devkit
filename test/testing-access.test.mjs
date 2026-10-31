import assert from "node:assert/strict";
import test from "node:test";

import { stubAccess } from "@dustinedwards/devkit/access";

const ISSUER = "https://sample.cloudflareaccess.com/cdn-cgi/access/sso/oidc/sample-client";
const CHALLENGE = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("v"))).toString("base64url");
const AUTHORIZE = `${ISSUER}/authorization?client_id=sample-client&nonce=n-123&state=s&redirect_uri=https://app.test/cb&code_challenge=${CHALLENGE}&code_challenge_method=S256`;

const decode = (/** @type {string} */ part) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

/** Verifies a token against the JWKS the stub serves, the way the code under test would. */
async function verify(/** @type {string} */ jwt, /** @type {string} */ jwksUrl) {
  const [head, body, signature] = jwt.split(".");
  const { keys } = await (await fetch(jwksUrl)).json();
  const jwk = keys.find((/** @type {{ kid: string }} */ k) => k.kid === decode(head).kid);
  if (!jwk) return { ok: false };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, Buffer.from(signature, "base64url"), new TextEncoder().encode(`${head}.${body}`));
  return { ok, header: decode(head), claims: decode(body) };
}

test("the token endpoint answers an ID token the JWKS verifies, with the issuer, audience, email and the flow's nonce", async () => {
  const stub = await stubAccess({ issuer: ISSUER, audience: "sample-client", email: "dustin@example.com", authorizationUrl: AUTHORIZE });
  const exchange = (/** @type {Record<string, string>} */ form) =>
    fetch(`${ISSUER}/token`, { method: "POST", body: new URLSearchParams({ grant_type: "authorization_code", code: "c", redirect_uri: "https://app.test/cb", ...form }) });
  try {
    for (const [form, error] of [[{ code_verifier: "w" }, "invalid_grant"], [{ code_verifier: "v", redirect_uri: "https://app.test/other" }, "invalid_grant"], [{ code_verifier: "v", grant_type: "password" }, "unsupported_grant_type"]]) {
      const refused = await exchange(form);
      assert.deepEqual([refused.status, (await refused.json()).error], [400, error], JSON.stringify(form));
    }
    stub.tokenRequests.length = 0;
    const res = await exchange({ code_verifier: "v" });
    const { id_token: idToken, token_type: type, access_token: accessToken } = await res.json();
    assert.equal(type, "bearer");
    assert.ok(accessToken);
    const { ok, header, claims } = await verify(idToken, `${ISSUER}/jwks`);
    assert.equal(ok, true);
    assert.equal(header.alg, "RS256");
    assert.equal(claims.iss, ISSUER);
    assert.equal(claims.aud, "sample-client");
    assert.equal(claims.email, "dustin@example.com");
    assert.equal(claims.nonce, "n-123");
    assert.ok(claims.exp > claims.iat);
    assert.equal(stub.tokenRequests.length, 1);
    assert.equal(stub.tokenRequests[0].get("code_verifier"), "v");
    assert.equal(stub.tokenRequests[0].get("redirect_uri"), "https://app.test/cb");
  } finally {
    stub.restore();
  }
});

test("claims sit over the defaults and token(extra) over both; a token from another stub does not verify", async () => {
  const stub = await stubAccess({ issuer: ISSUER, audience: "a", email: "x@example.com", claims: { groups: ["admin"], aud: "b" }, install: false });
  const other = await stubAccess({ issuer: ISSUER, audience: "a", email: "x@example.com", install: false });
  const installed = (await import("@dustinedwards/devkit/network")).installFetch(stub.fetch);
  try {
    const jwt = await stub.token({ email: "y@example.com", exp: 1 });
    const { ok, claims } = await verify(jwt, stub.jwksUrl);
    assert.equal(ok, true);
    assert.deepEqual(claims.groups, ["admin"]);
    assert.equal(claims.aud, "b");
    assert.equal(claims.email, "y@example.com");
    assert.equal(claims.exp, 1);
    assert.equal("nonce" in claims, false, "no authorization URL, no nonce");
    assert.equal((await verify(await other.token(), stub.jwksUrl)).ok, false);
  } finally {
    installed();
  }
});

test("the JWKS can be served where Access serves application certs, and keeps the previous key through a rotation", async () => {
  const certs = "https://sample.cloudflareaccess.com/cdn-cgi/access/certs";
  const stub = await stubAccess({ issuer: "https://sample.cloudflareaccess.com", audience: "aud-tag", email: "x@example.com", jwksUrl: certs });
  try {
    assert.equal(stub.jwksUrl, certs);
    const before = await stub.token();
    const { ok, claims } = await verify(before, certs);
    assert.equal(ok, true);
    assert.deepEqual(claims.aud, ["aud-tag"]);
    await stub.rotate();
    assert.equal((await verify(before, certs)).ok, true, "the previous key still verifies");
    assert.equal((await verify(await stub.token(), certs)).ok, true);
    await stub.rotate();
    assert.equal((await verify(before, certs)).ok, false, "two rotations later the key is gone");
    await assert.rejects(fetch("https://sample.cloudflareaccess.com/jwks"), /does not answer/);
  } finally {
    stub.restore();
  }
});

test("an unknown URL throws naming it, unless the fallback answers it", async () => {
  const stub = await stubAccess({
    issuer: ISSUER,
    audience: "a",
    email: "x@example.com",
    fallback: (url) => (url === "https://client.test/metadata.json" ? Response.json({ client_id: "c" }) : undefined),
  });
  try {
    assert.deepEqual(await (await fetch("https://client.test/metadata.json")).json(), { client_id: "c" });
    await assert.rejects(fetch("https://example.test/elsewhere"), /the Access stub does not answer https:\/\/example\.test\/elsewhere/);
  } finally {
    stub.restore();
  }
});

test("a token request sent as a Request is recorded too", async () => {
  const stub = await stubAccess({ issuer: ISSUER, audience: "a", email: "x@example.com" });
  try {
    await fetch(new Request(`${ISSUER}/token`, { method: "POST", body: new URLSearchParams({ code: "r" }) }));
    assert.equal(stub.tokenRequests[0].get("code"), "r");
  } finally {
    stub.restore();
  }
});

test("restore puts the real fetch back; install: false never touches it; issuer and audience are required", async () => {
  const real = globalThis.fetch;
  const stub = await stubAccess({ issuer: ISSUER, audience: "a", email: "x@example.com" });
  assert.notEqual(globalThis.fetch, real);
  stub.restore();
  assert.equal(globalThis.fetch, real);
  await stubAccess({ issuer: ISSUER, audience: "a", email: "x@example.com", install: false });
  assert.equal(globalThis.fetch, real);
  await assert.rejects(stubAccess({ issuer: "", audience: "a", email: "x@example.com" }), /needs the issuer and audience/);
});
