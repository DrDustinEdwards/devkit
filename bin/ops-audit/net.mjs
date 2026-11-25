const TIMEOUT_MS = 15_000;

// A gateway's answer when the Worker is not answering at all (Cloudflare's 52x pages among them): nothing was read.
const OUTAGE = new Set([502, 504, 520, 521, 522, 523, 524, 525, 526, 527, 530]);

/** A read with a timeout and no redirect followed; the error instead of a throw. @param {string} url */
export async function read(url, accept = "*/*") {
  try {
    const response = await fetch(url, {
      redirect: "manual",
      headers: { accept, "user-agent": "devkit-ops-audit" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await response.text();
    const header = (/** @type {string} */ name) => response.headers.get(name) ?? "";
    return {
      url,
      status: response.status,
      contentType: header("content-type"),
      cacheControl: header("cache-control"),
      robots: header("x-robots-tag"),
      location: header("location"),
      retryAfter: header("retry-after"),
      body,
    };
  } catch (error) {
    return {
      url,
      error:
        error instanceof Error
          ? error.cause instanceof Error
            ? error.cause.message
            : error.message
          : String(error),
    };
  }
}

/** One GitHub REST read; the parsed body, or the reason it could not be read. @param {string} path */
export async function github(path) {
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "devkit-ops-audit",
    ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  };
  try {
    const response = await fetch(`https://api.github.com${path}`, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok)
      return { status: response.status, error: `GitHub answered ${response.status} for ${path}` };
    return { status: response.status, body: await response.json() };
  } catch (error) {
    return {
      status: 0,
      error: `GitHub did not answer for ${path}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * One file from a repository at a ref: its text, null when there is no such file, or the reason it could not be read.
 * @param {string} repo @param {string} path @param {string} ref
 * @returns {Promise<{ text: string | null, error?: undefined } | { error: string, text?: undefined }>}
 */
export async function githubFile(repo, path, ref) {
  const headers = {
    accept: "application/vnd.github.raw+json",
    "user-agent": "devkit-ops-audit",
    ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  };
  const where = `/repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`;
  try {
    const response = await fetch(`https://api.github.com${where}`, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 404) return { text: null };
    if (!response.ok) return { error: `GitHub answered ${response.status} for ${where}` };
    return { text: await response.text() };
  } catch (error) {
    return {
      error: `GitHub did not answer for ${where}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export const isRead = (/** @type {any} */ r) =>
  !r.error && !(OUTAGE.has(r.status) && !/json/i.test(r.contentType));
