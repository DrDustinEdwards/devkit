#!/usr/bin/env node
// THE AUTOMATIC PR REVIEWER's runner side (review.yml). Asks Capsid to review this pull request, then writes the
// verdict where people and sessions read it: a check run named "review verdict" on the head commit, and the job summary.
// Never a comment: comments notify.
//
// A REQUIRED CHECK (Dustin, 2026-11-28). A BLOCK verdict (merging would do harm that is hard to undo) fails the check,
// and this script exits 1, so the job's own check, the one a ruleset requires, fails too and GitHub's auto-merge waits.
// APPROVE and CHANGES are neutral, a skipped pull request is skipped. A reviewer that cannot run, or that Capsid refuses,
// says so in a neutral check and blocks nothing. The job's check is required rather than "review verdict" because GitHub
// may file a check run made with GITHUB_TOKEN in another workflow's check suite, where a required check does not see it.
//
// Capsid is reached with this job's GitHub Actions OIDC token (audience capsid-review), so no key is stored anywhere.
// Capsid reads the pull request itself through its GitHub App; this sends nothing but the token.
//
// Environment: ACTIONS_ID_TOKEN_REQUEST_URL and ACTIONS_ID_TOKEN_REQUEST_TOKEN (the job's id-token: write),
// GITHUB_TOKEN (checks: write), GITHUB_REPOSITORY, HEAD_SHA, GITHUB_STEP_SUMMARY.

import { appendFileSync } from "node:fs";

const CAPSID = "https://mcp.dustinedwards.info";
const AUDIENCE = "capsid-review";
const CHECK_NAME = "review verdict";
// A reasoning model on a large diff takes minutes; Capsid's own deadline on the model is six.
const CAPSID_TIMEOUT_MS = 8 * 60_000;

/**
 * The check run's conclusion, title and summary for Capsid's answer (or the reason there is none).
 * @param {any} result Capsid's JSON answer, or { status: "error", error } when it could not be read
 * @returns {{ conclusion: "failure" | "neutral" | "skipped", title: string, summary: string }}
 */
export function checkOutput(result) {
  if (result?.status === "skipped") {
    return {
      conclusion: "skipped",
      title: "Not reviewed",
      summary: `Skipped: ${(result.reasons ?? []).join("; ") || "no reason given"}.`,
    };
  }
  if (result?.status === "reviewed") {
    const findings = Array.isArray(result.findings) ? result.findings : [];
    const title = findings.length
      ? `${result.verdict}: ${findings.length} finding${findings.length === 1 ? "" : "s"}`
      : result.verdict;
    const lines = findings.map(
      (/** @type {{ kind: string, file: string, line?: number, note: string }} */ f) =>
        `- **${f.kind}**, \`${f.file}${f.line ? `:${f.line}` : ""}\`: ${f.note}`,
    );
    const body = [
      `**${result.verdict}**. ${result.summary ?? ""}`.trim(),
      lines.length ? lines.join("\n") : "No findings.",
      `Model: \`${result.model}\`, head \`${String(result.head_sha).slice(0, 7)}\`.`,
    ];
    return {
      conclusion: result.verdict === "BLOCK" ? "failure" : "neutral",
      title,
      summary: body.join("\n\n"),
    };
  }
  return {
    conclusion: "neutral",
    title: "Reviewer could not run",
    summary: `The reviewer could not run: ${result?.error ?? "no answer"}. This blocks nothing.`,
  };
}

async function oidcToken() {
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const bearer = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !bearer) throw new Error("no OIDC token: the calling job must grant id-token: write");
  const resp = await fetch(`${url}&audience=${AUDIENCE}`, {
    headers: { Authorization: `Bearer ${bearer}` },
  });
  if (!resp.ok) throw new Error(`the OIDC token request answered ${resp.status}`);
  return /** @type {{ value: string }} */ (await resp.json()).value;
}

async function askCapsid() {
  try {
    const token = await oidcToken();
    const resp = await fetch(`${CAPSID}/review/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(CAPSID_TIMEOUT_MS),
    });
    if (!resp.ok)
      return {
        status: "error",
        error: `Capsid answered ${resp.status}: ${(await resp.text()).slice(0, 300)}`,
      };
    return await resp.json();
  } catch (error) {
    return { status: "error", error: error instanceof Error ? error.message : String(error) };
  }
}

/** @param {ReturnType<typeof checkOutput>} output */
async function writeCheck(output) {
  const repo = process.env.GITHUB_REPOSITORY;
  const resp = await fetch(`https://api.github.com/repos/${repo}/check-runs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: CHECK_NAME,
      head_sha: process.env.HEAD_SHA,
      status: "completed",
      conclusion: output.conclusion,
      output: { title: output.title, summary: output.summary },
    }),
  });
  if (!resp.ok)
    console.log(
      `::warning::could not write the ${CHECK_NAME} check: GitHub answered ${resp.status}`,
    );
}

if (import.meta.main) {
  const output = checkOutput(await askCapsid());
  console.log(`${output.title}\n\n${output.summary}`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Review verdict: ${output.title}\n\n${output.summary}\n`,
    );
  try {
    await writeCheck(output);
  } catch (err) {
    console.log(
      `::warning::could not write the ${CHECK_NAME} check: ${err instanceof Error ? err.message : err}`,
    );
  }
  if (output.conclusion === "failure") {
    console.log("::error::The reviewer's verdict is BLOCK: fix the findings and push.");
    process.exitCode = 1;
  }
}
