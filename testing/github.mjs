// A fake of the GitHub API for code that reads and commits files through it. Stubbed at the outbound fetch, not the
// module, because the module calling GitHub is the subject. The owner, repository and branch are parameters.
//
// An unknown host or path THROWS, so nothing can fall through to the live repository. Blob shas are REAL git blob
// shas, or a provenance check that compares them could not fail; tree and commit shas are 40 hex digits as GitHub's
// are. Statuses and field names follow GitHub's OpenAPI description (test/fixtures/fakes-contract.json). A
// tree applies only when the ref moves, and the ref moves only forward unless `force`, so a refused or stale save
// leaves the repository unchanged.

import { installFetch, urlOf } from "./network.mjs";

const API = "https://api.github.com";
const STUB_HEAD_SHA = "a".repeat(40);
const encoder = new TextEncoder();

/** @param {Uint8Array} bytes */
const sha1 = async (bytes) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-1", bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");

/**
 * The sha git gives `content` as a blob: SHA-1 over `blob <byte length>\0` and the bytes. The header counts UTF-8
 * BYTES, not string length.
 *
 * @param {string} content
 * @returns {Promise<string>} lowercase hex
 */
export async function gitBlobSha(content) {
  const body = encoder.encode(content);
  const header = encoder.encode(`blob ${body.byteLength}\0`);
  const framed = new Uint8Array(header.byteLength + body.byteLength);
  framed.set(header, 0);
  framed.set(body, header.byteLength);
  return sha1(framed);
}

/**
 * @typedef {{ method: string, path: string, body: unknown }} RecordedCall
 * @typedef {{ sha: string, message: string, author: string, date: string }} HistoryEntry
 * @typedef {{ tree: string, parents: string[], message: string }} Commit
 */

/**
 * Stands up the fake for one repository. By default it is installed as the global fetch; `install: false` leaves the
 * global alone and the caller passes `fetch` to the code under test. With `token`, the repository is private: a
 * request without it answers 404 and one with another token 401, as GitHub does.
 *
 * @param {{ owner: string, repo: string, branch?: string, files?: Record<string, string>, install?: boolean, token?: string }} options
 */
export function stubGitHub({ owner, repo, branch = "main", files: seed = {}, install = true, token }) {
  if (!owner || !repo) throw new Error("stubGitHub needs the owner and repo it stands in for.");
  const prefix = `/repos/${owner}/${repo}`;

  /** The head commit's tree. A test may change it directly. @type {Map<string, string>} */
  const files = new Map(Object.entries(seed));
  /** @type {RecordedCall[]} */
  const calls = [];
  /** @type {HistoryEntry[]} */
  const history = [];
  /** @type {Map<string, number>} */
  const failures = new Map();
  /** @type {Map<string, string>} */
  const blobs = new Map();
  const head = { commitSha: STUB_HEAD_SHA, treeSha: "b".repeat(40) };
  /** Every tree by sha; the head's is `files` itself. @type {Map<string, Map<string, string>>} */
  const trees = new Map([[head.treeSha, files]]);
  /** @type {Map<string, Commit>} */
  const commits = new Map([[head.commitSha, { tree: head.treeSha, parents: [], message: "Initial" }]]);
  let commitCounter = 0;

  const json = (/** @type {unknown} */ body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const refBody = () => ({
    ref: `refs/heads/${branch}`,
    url: `${API}${prefix}/git/refs/heads/${branch}`,
    object: { type: "commit", sha: head.commitSha, url: `${API}${prefix}/git/commits/${head.commitSha}` },
  });
  const commitBody = (/** @type {string} */ sha, /** @type {Commit} */ commit) => ({
    sha,
    url: `${API}${prefix}/git/commits/${sha}`,
    message: commit.message,
    tree: { sha: commit.tree, url: `${API}${prefix}/git/trees/${commit.tree}` },
    parents: commit.parents.map((p) => ({ sha: p, url: `${API}${prefix}/git/commits/${p}` })),
  });

  /**
   * Each recorded endpoint: `path` is matched exactly, or as a prefix when `prefix` is set.
   *
   * @type {Array<{ method: string, path: string, prefix?: boolean, handle: (path: string, body: any, query: URLSearchParams) => Response | Promise<Response> }>}
   */
  const routes = [
    { method: "GET", path: `${prefix}/git/ref/heads/${branch}`, handle: () => json(refBody()) },
    {
      method: "GET",
      path: `${prefix}/git/commits/`,
      prefix: true,
      handle: (path) => {
        const sha = path.slice(`${prefix}/git/commits/`.length);
        const commit = commits.get(sha);
        return commit ? json(commitBody(sha, commit)) : json({ message: "Not Found" }, 404);
      },
    },
    { method: "GET", path: `${prefix}/contents/`, prefix: true, handle: getContents },
    {
      method: "GET",
      path: `${prefix}/commits`,
      // With no history planted the listing fails, so a case that reads history has to say what it is.
      handle: () =>
        history.length === 0
          ? json({ message: "no history planted" }, 500)
          : json(history.map((c) => ({ sha: c.sha, commit: { message: c.message, author: { name: c.author, date: c.date } } }))),
    },
    { method: "POST", path: `${prefix}/git/blobs`, handle: postBlob },
    { method: "POST", path: `${prefix}/git/trees`, handle: postTree },
    { method: "POST", path: `${prefix}/git/commits`, handle: postCommit },
    { method: "PATCH", path: `${prefix}/git/refs/heads/${branch}`, handle: patchRef },
  ];

  /** @param {string} path @param {unknown} _body @param {URLSearchParams} query */
  async function getContents(path, _body, query) {
    const target = decodeURI(path.slice(`${prefix}/contents/`.length));
    const ref = query.get("ref");
    const tree = !ref || ref === branch ? files : trees.get(commits.get(ref)?.tree ?? "");
    if (!tree) return json({ message: "Not Found" }, 404);

    // A directory answers with an ARRAY of its immediate children and a file with an OBJECT, as GitHub does: a nested
    // file shows as its folder, `type: "dir"`.
    const children = [...tree.keys()].filter((p) => p.startsWith(`${target}/`));
    if (!tree.has(target) && children.length > 0) {
      const names = [...new Set(children.map((p) => p.slice(target.length + 1).split("/")[0] ?? ""))];
      return json(
        await Promise.all(
          names.map(async (name) => {
            const path = `${target}/${name}`;
            const content = tree.get(path);
            if (content === undefined) return { name, path, sha: await sha1(encoder.encode(`tree ${path}`)), type: "dir", size: 0 };
            return { name, path, sha: await gitBlobSha(content), type: "file", size: encoder.encode(content).byteLength };
          }),
        ),
      );
    }

    const content = tree.get(target);
    if (content === undefined) return json({ message: "Not Found" }, 404);
    const bytes = encoder.encode(content);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    // GitHub wraps the base64 at 60 characters, each line ending in a newline.
    const wrapped = btoa(binary).replace(/.{1,60}/g, "$&\n");
    return json({ type: "file", name: target.split("/").pop(), path: target, content: wrapped, encoding: "base64", sha: await gitBlobSha(content), size: bytes.byteLength });
  }

  /** @param {string} _path @param {{ content: string, encoding?: string }} body */
  async function postBlob(_path, { content, encoding }) {
    const text = encoding === "base64" ? new TextDecoder().decode(Uint8Array.from(atob(content), (c) => c.charCodeAt(0))) : content;
    const sha = await gitBlobSha(text);
    blobs.set(sha, text);
    return json({ sha, url: `${API}${prefix}/git/blobs/${sha}` }, 201);
  }

  /** @param {string} _path @param {{ tree: Array<{ path: string, sha?: string | null, content?: string }>, base_tree?: string }} body */
  async function postTree(_path, { tree, base_tree: baseTree }) {
    const base = baseTree ? trees.get(baseTree) : new Map();
    if (!base) return json({ message: `base_tree ${baseTree} is not a tree here` }, 422);
    const next = new Map(base);
    for (const entry of tree) {
      if (entry.content !== undefined) next.set(entry.path, entry.content);
      else if (entry.sha === null) next.delete(entry.path);
      else {
        const content = blobs.get(entry.sha ?? "");
        if (content === undefined) throw new Error(`the tree names blob ${entry.sha}, which no recorded blob POST created.`);
        next.set(entry.path, content);
      }
    }
    const sha = await sha1(encoder.encode(JSON.stringify([...next].sort())));
    if (sha !== head.treeSha) trees.set(sha, next);
    return json({ sha, url: `${API}${prefix}/git/trees/${sha}` }, 201);
  }

  /** @param {string} _path @param {{ message?: string, tree?: string, parents?: string[] }} body */
  async function postCommit(_path, { message, tree, parents = [] }) {
    if (typeof message !== "string" || !trees.has(tree ?? "")) return json({ message: "a commit needs a message and a tree that exists" }, 422);
    const commit = { tree: /** @type {string} */ (tree), parents, message };
    const sha = await sha1(encoder.encode(`commit ${++commitCounter} ${JSON.stringify(commit)}`));
    commits.set(sha, commit);
    return json(commitBody(sha, commit), 201);
  }

  /** Whether `sha` is `ancestor` or reaches it through parents: a fast forward. */
  function descends(/** @type {string} */ sha, /** @type {string} */ ancestor) {
    const seen = new Set();
    for (const queue = [sha]; queue.length > 0; ) {
      const next = /** @type {string} */ (queue.pop());
      if (next === ancestor) return true;
      if (!seen.has(next)) queue.push(...(commits.get(next)?.parents ?? []));
      seen.add(next);
    }
    return false;
  }

  /** @param {string} _path @param {{ sha: string, force?: boolean }} body */
  function patchRef(_path, { sha, force = false }) {
    const commit = commits.get(sha);
    if (!commit) return json({ message: "Object does not exist" }, 422);
    if (!force && !descends(sha, head.commitSha)) return json({ message: "Update is not a fast forward" }, 422);
    const tree = new Map(trees.get(commit.tree));
    trees.set(head.treeSha, new Map(files));
    files.clear();
    for (const [path, content] of tree) files.set(path, content);
    trees.set(commit.tree, files);
    head.commitSha = sha;
    head.treeSha = commit.tree;
    return json(refBody());
  }

  /** @type {typeof fetch} */
  const stub = async (input, init) => {
    const url = urlOf(input);
    if (!url.startsWith(API)) {
      throw new Error(
        `the GitHub stub refuses ${url}: this layer never reaches the network. ` +
          `If a new outbound call is legitimate, record its shape in the stub.`,
      );
    }

    const request = new Request(input, init);
    const method = request.method;
    const full = url.slice(API.length);
    const [path = "", search = ""] = full.split("?");
    const rawBody = await request.text();
    const body = rawBody ? JSON.parse(rawBody) : null;
    calls.push({ method, path: full, body });

    if (token !== undefined) {
      const sent = request.headers.get("authorization")?.replace(/^(Bearer|token) /i, "");
      if (!sent) return json({ message: "Not Found" }, 404);
      if (sent !== token) return json({ message: "Bad credentials" }, 401);
    }

    for (const [fragment, remaining] of failures) {
      if (remaining > 0 && full.includes(fragment)) {
        failures.set(fragment, remaining - 1);
        return json({ message: `planted failure on ${fragment}` }, 500);
      }
    }

    const route = routes.find((r) => r.method === method && (r.prefix ? path.startsWith(r.path) : path === r.path));
    if (route) return route.handle(path, body ?? {}, new URLSearchParams(search));

    throw new Error(
      `the GitHub stub has no recorded shape for ${method} ${path}. Record it rather than letting the call through.`,
    );
  };

  const restore = install ? installFetch(stub) : () => {};

  return {
    calls,
    files,
    history,
    /** Fail the next `times` requests whose path contains `fragment`, with a 500. */
    failNext: (/** @type {string} */ fragment, /** @type {number} */ times) => void failures.set(fragment, times),
    fetch: stub,
    restore,
  };
}

/**
 * The blob sha of a file as the stub holds it now: what a caller that versions files by blob sha would send back.
 *
 * @param {{ files: Map<string, string> }} stub
 * @param {string} path
 */
export const versionOf = async (stub, path) => {
  const content = stub.files.get(path);
  if (content === undefined) throw new Error(`versionOf: ${path} is not in the stub`);
  return gitBlobSha(content);
};
