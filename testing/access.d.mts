export type AccessStub = {
  issuer: string;
  /** `<issuer>/token`, where the ID token is answered. */
  tokenUrl: string;
  /** Where the public key is served: `jwksUrl` when given, `<issuer>/jwks` otherwise. */
  jwksUrl: string;
  /** The public half of the current signing key, as the JWKS serves it. */
  readonly jwk: JsonWebKey & { kid: string };
  /** Moves to a new signing key. The key it replaces stays in the JWKS, as Access keeps the previous key after a rotation. */
  rotate: () => Promise<void>;
  /**
   * An application token (Cf-Access-Jwt-Assertion) signed by the current key: `aud` an array holding the audience,
   * `email`, `exp`, `iat`, `nbf`, `iss`, `type: "app"`, `identity_nonce`, `sub` and `country`, then `claims`, then `extra`.
   */
  token: (extra?: Record<string, unknown>) => Promise<string>;
  /** The form bodies the token endpoint received, so a test can read the PKCE verifier and redirect_uri sent. */
  tokenRequests: URLSearchParams[];
  /** The fake itself, for code that takes a fetch rather than reading the global. */
  fetch: typeof fetch;
  /** Puts back the global fetch the stub replaced. A no-op when it was created with `install: false`. */
  restore: () => void;
};

/**
 * Stands up a fake Access for SaaS for one sign-in: the token endpoint (POST, `grant_type=authorization_code`, the
 * authorization request's `redirect_uri` and a `code_verifier` matching its `code_challenge`, or a 400 as RFC 6749
 * words it) answers an RS256 ID token with `aud` the audience, `sub`, the email and the nonce, signed by a key made
 * here. The JWKS serves two keys, `keys`, `public_cert` and `public_certs`, as Access's certs endpoint does. Installed
 * as the global fetch unless `install` is false. An unknown URL throws unless `fallback` answers it.
 */
export function stubAccess(options: {
  issuer: string;
  audience: string;
  email: string;
  /** The authorization URL the flow sent the browser to; its nonce is echoed in the token. */
  authorizationUrl?: string;
  /** Claims added to every token, over the defaults. */
  claims?: Record<string, unknown>;
  /** Default `<issuer>/jwks`. */
  jwksUrl?: string;
  /** Answers any other URL the sign-in reaches; return undefined to refuse it. */
  fallback?: (url: string, init?: RequestInit) => Response | Promise<Response> | undefined;
  /** Default true. */
  install?: boolean;
}): Promise<AccessStub>;
