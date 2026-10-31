// A fake of Cloudflare Access: as an OIDC provider (Access for SaaS), as a login callback reaches it, the token
// endpoint answering an RS256 ID token; and as the application token Access sends an origin (Cf-Access-Jwt-Assertion),
// with the claims Cloudflare documents. The key set holds two keys, the current one and the one it replaced, in JWK
// and PEM form as /cdn-cgi/access/certs serves them, and `rotate` moves to a new key as Access does every six weeks.
// The issuer, the audience and the claims are parameters; any other route the code under test needs is left to a
// `fallback` the caller passes.
//
// An unknown URL THROWS, so a sign-in cannot fall through to the real Access. The token is really signed and the JWKS
// really serves its key, so the code under test verifies it exactly as it verifies Access's.

import { installFetch, urlOf } from "./network.mjs";

const encoder = new TextEncoder();
const RSA = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };

/** @param {Uint8Array} bytes */
const b64 = (bytes) => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
/** @param {Uint8Array} bytes */
const b64url = (bytes) => b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
/** @param {unknown} value */
const b64json = (value) => b64url(encoder.encode(JSON.stringify(value)));
const hex = (/** @type {Uint8Array} */ bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** One DER element: tag, length, then the parts. */
function der(/** @type {number} */ tag, /** @type {Array<Uint8Array | number[]>} */ ...parts) {
  const body = Uint8Array.from(parts.flatMap((p) => [...p]));
  const n = body.byteLength;
  const length = n < 128 ? [n] : n < 256 ? [0x81, n] : [0x82, n >> 8, n & 255];
  return Uint8Array.from([tag, ...length, ...body]);
}

/** A self-signed X.509 certificate for the key, in PEM, as `public_certs` carries one. */
async function certificate(/** @type {CryptoKeyPair} */ pair) {
  const sha256Rsa = der(0x30, der(0x06, [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b]), [0x05, 0x00]);
  const name = der(0x30, der(0x31, der(0x30, der(0x06, [0x55, 0x04, 0x03]), der(0x0c, encoder.encode("access stub")))));
  const utc = (/** @type {number} */ ms) => der(0x17, encoder.encode(`${new Date(ms).toISOString().slice(2, 19).replace(/\D/g, "")}Z`));
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  const tbs = der(0x30, der(0x02, [1]), sha256Rsa, name, der(0x30, utc(Date.now()), utc(Date.now() + 864e5 * 365)), name, spki);
  const signature = new Uint8Array(await crypto.subtle.sign(RSA, pair.privateKey, tbs));
  const body = b64(der(0x30, tbs, sha256Rsa, der(0x03, [0], signature))).replace(/.{1,64}/g, "$&\n");
  return `-----BEGIN CERTIFICATE-----\n${body}-----END CERTIFICATE-----\n`;
}

/** A signing key with a 64-hex kid, its public JWK and its certificate. */
async function signingKey() {
  const pair = /** @type {CryptoKeyPair} */ (
    await crypto.subtle.generateKey({ ...RSA, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ["sign", "verify"])
  );
  const kid = hex(crypto.getRandomValues(new Uint8Array(32)));
  const { kty, e, n } = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const jwk = { kid, kty, alg: "RS256", use: "sig", e, n };
  return { pair, kid, jwk, cert: await certificate(pair) };
}

/** S256 or plain, as RFC 7636 section 4.6 checks a verifier against its challenge. */
async function pkceMatches(/** @type {string} */ verifier, /** @type {string} */ challenge, /** @type {string | null} */ method) {
  if (method === "plain") return verifier === challenge;
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(verifier)))) === challenge;
}

/**
 * Stands up the fake for one Access application and one sign-in. Installed as the global fetch unless `install` is false.
 *
 * @param {{
 *   issuer: string,
 *   audience: string,
 *   email: string,
 *   authorizationUrl?: string,
 *   claims?: Record<string, unknown>,
 *   jwksUrl?: string,
 *   fallback?: (url: string, init?: RequestInit) => Response | Promise<Response> | undefined,
 *   install?: boolean,
 * }} options
 */
export async function stubAccess({ issuer, audience, email, authorizationUrl, claims = {}, jwksUrl, fallback, install = true }) {
  if (!issuer || !audience) throw new Error("stubAccess needs the issuer and audience of the Access application it stands in for.");
  const base = issuer.replace(/\/+$/, "");
  const tokenUrl = `${base}/token`;
  const keysUrl = jwksUrl ?? `${base}/jwks`;
  // What the flow sent the browser away with: the nonce is echoed, the redirect and the PKCE challenge are checked.
  const asked = authorizationUrl ? new URL(authorizationUrl).searchParams : new URLSearchParams();
  const nonce = asked.get("nonce");
  const sub = crypto.randomUUID();
  /** The previous key, then the current one that signs. */
  let keys = await Promise.all([signingKey(), signingKey()]);

  /** @param {Record<string, unknown>} payload */
  async function sign(payload) {
    const key = /** @type {Awaited<ReturnType<typeof signingKey>>} */ (keys[1]);
    const head = b64json({ alg: "RS256", kid: key.kid, typ: "JWT" });
    const body = b64json(payload);
    const signature = new Uint8Array(await crypto.subtle.sign(RSA, key.pair.privateKey, encoder.encode(`${head}.${body}`)));
    return `${head}.${body}.${b64url(signature)}`;
  }
  const now = () => Math.floor(Date.now() / 1000);

  /**
   * An application token signed by the current key, with the claims Cloudflare documents for an identity-based sign-in
   * and a five-minute life, then `claims` on top, then `extra`. What a test sends as Cf-Access-Jwt-Assertion.
   *
   * @param {Record<string, unknown>} [extra]
   */
  const token = (extra = {}) => {
    const iat = now();
    const identityNonce = b64url(crypto.getRandomValues(new Uint8Array(12)));
    return sign({ aud: [audience], email, exp: iat + 300, iat, nbf: iat, iss: issuer, type: "app", identity_nonce: identityNonce, sub, country: "US", ...claims, ...extra });
  };

  /** @type {URLSearchParams[]} */
  const tokenRequests = [];

  /** The token endpoint, refusing as RFC 6749 section 5.2 does what Access would refuse. */
  async function exchange(/** @type {URLSearchParams} */ form) {
    const refuse = (/** @type {string} */ error, /** @type {string} */ description) =>
      Response.json({ error, error_description: description }, { status: 400 });
    if (form.get("grant_type") !== "authorization_code") return refuse("unsupported_grant_type", "only authorization_code is answered");
    if (!form.get("code")) return refuse("invalid_request", "no code");
    const redirect = asked.get("redirect_uri");
    if (redirect && form.get("redirect_uri") !== redirect) return refuse("invalid_grant", "redirect_uri differs from the authorization request's");
    const challenge = asked.get("code_challenge");
    if (challenge && !(await pkceMatches(form.get("code_verifier") ?? "", challenge, asked.get("code_challenge_method")))) {
      return refuse("invalid_grant", "code_verifier does not match the code_challenge");
    }
    const iat = now();
    const idToken = await sign({ iss: issuer, aud: audience, sub, iat, exp: iat + 300, email, ...(nonce ? { nonce } : {}), ...claims });
    return Response.json({ access_token: b64url(crypto.getRandomValues(new Uint8Array(32))), id_token: idToken, token_type: "bearer", expires_in: 300 });
  }

  /** @type {typeof fetch} */
  const fake = async (input, init) => {
    const url = urlOf(input);
    const request = url === tokenUrl || url === keysUrl ? new Request(input, init) : null;
    if (request?.method === "POST" && url === tokenUrl) {
      const form = new URLSearchParams(await request.text());
      tokenRequests.push(form);
      return exchange(form);
    }
    if (request?.method === "GET" && url === keysUrl) {
      return Response.json({
        keys: keys.map((k) => k.jwk),
        public_cert: { kid: keys[1]?.kid, cert: keys[1]?.cert },
        public_certs: keys.map((k) => ({ kid: k.kid, cert: k.cert })),
      });
    }
    const other = fallback ? await fallback(url, init) : undefined;
    if (other) return other;
    throw new Error(`the Access stub does not answer ${url}; pass a fallback for the other routes this sign-in needs.`);
  };

  const restore = install ? installFetch(fake) : () => {};
  return {
    issuer,
    tokenUrl,
    jwksUrl: keysUrl,
    /** The current signing key's public half. */
    get jwk() {
      return /** @type {Awaited<ReturnType<typeof signingKey>>} */ (keys[1]).jwk;
    },
    /** A new current key; the one it replaces stays in the key set, and the one before that leaves it. */
    rotate: async () => void (keys = [/** @type {Awaited<ReturnType<typeof signingKey>>} */ (keys[1]), await signingKey()]),
    token,
    tokenRequests,
    fetch: fake,
    restore,
  };
}
