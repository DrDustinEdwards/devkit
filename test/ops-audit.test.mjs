// The parsing in devkit-ops-audit that a live run would not show going wrong: the health shapes, the status and code pair,
// the backup and drill ages, and the deploy grace.

import assert from "node:assert/strict";
import test from "node:test";

import { drillFindings, healthFindings, notFoundFindings, shaFindings } from "../bin/ops-audit.mjs";

const url = "https://example.com/health";
const read = (body, extra = {}) => ({ url, status: 200, contentType: "application/health+json; charset=utf-8", cacheControl: "private, no-store", robots: "noindex", body: JSON.stringify(body), ...extra });
const good = { status: "pass", ok: true, sha: "0123abc", time: "2026-10-30T00:00:00Z", backup: { last_ok: "2026-10-29T03:17:00Z", age_hours: 20 }, checks: [{ name: "db", status: "pass" }] };
const items = (findings) => findings.map((f) => `${f.severity} ${f.item}`);

test("the new shape is clean; the old shape is an H2 error naming what it lacks", () => {
  assert.deepEqual(healthFindings(read(good)).findings, []);
  const old = healthFindings(read({ ok: true, db: "up", time: good.time, sha: good.sha }));
  assert.deepEqual(items(old.findings), ["error H2"]);
  assert.match(old.findings[0].detail, /status, checks \(the old shape/);
});

test("H1 reads the media type through its parameters and each header; an HTML outage page is not JSON", () => {
  assert.deepEqual(healthFindings(read(good, { contentType: "application/json;charset=UTF-8" })).findings, []);
  const page = healthFindings({ url, status: 404, contentType: "text/html", cacheControl: "public, max-age=0", robots: "", body: "<!doctype html>" });
  assert.deepEqual(items(page.findings), ["error H1"]);
  assert.match(page.findings[0].detail, /answers 404.*text\/html.*no-store.*noindex.*not JSON/);
});

test("H3: 503 is for fail only, and fail is never 2xx", () => {
  assert.deepEqual(healthFindings(read({ ...good, status: "fail", ok: false }, { status: 503 })).findings, []);
  assert.deepEqual(items(healthFindings(read({ ...good, status: "warn" }, { status: 503 })).findings), ["error H3"]);
  assert.deepEqual(items(healthFindings(read({ ...good, status: "fail", ok: false })).findings), ["error H3"]);
});

test("B1 warns on a backup warning and fails at 26 hours; C2 warns on a cron check that is not pass", () => {
  assert.deepEqual(items(healthFindings(read({ ...good, backup: { age_hours: 25.9, warning: "slow" } })).findings), ["warning B1"]);
  assert.deepEqual(items(healthFindings(read({ ...good, backup: { last_ok: null, age_hours: 26 } })).findings), ["error B1"]);
  assert.deepEqual(items(healthFindings(read({ ...good, checks: [{ name: "cron", status: "warn", detail: "late" }] })).findings), ["warning C2"]);
});

test("a missing page must be an HTML 404, never a redirect or a soft 200", () => {
  assert.deepEqual(notFoundFindings({ url, status: 404, contentType: "text/html; charset=utf-8", location: "" }), []);
  assert.deepEqual(items(notFoundFindings({ url, status: 301, contentType: "", location: "/" })), ["error N1"]);
  assert.deepEqual(items(notFoundFindings({ url, status: 200, contentType: "text/html", location: "" })), ["error N1"]);
  assert.deepEqual(items(notFoundFindings({ url, status: 404, contentType: "application/json", location: "" })), ["error N6"]);
});

test("H4 matches an abbreviated sha, waits 30 minutes for a deploy in flight; R1 needs a success within 8 days", () => {
  const now = Date.parse("2026-10-30T12:00:00Z");
  const head = (minutes) => ({ sha: "0123abcdef0123abcdef0123abcdef0123abcdef", date: new Date(now - minutes * 60_000).toISOString(), url: "https://github.com/x" });
  assert.deepEqual(shaFindings({ url, liveSha: "0123ABC", head: head(90), now }), []);
  assert.deepEqual(items(shaFindings({ url, liveSha: "fedcba9", head: head(10), now })), ["warning H4"]);
  assert.deepEqual(items(shaFindings({ url, liveSha: "fedcba9", head: head(31), now })), ["error H4"]);
  const run = (days, conclusion = "success") => ({ conclusion, created_at: new Date(now - days * 86_400_000).toISOString(), html_url: "https://github.com/r" });
  assert.deepEqual(drillFindings({ url, run: run(7.9), now }), []);
  assert.deepEqual(items(drillFindings({ url, run: run(8.1), now })), ["error R1"]);
  assert.deepEqual(items(drillFindings({ url, run: run(1, "failure"), now })), ["error R1"]);
  assert.deepEqual(items(drillFindings({ url, run: undefined, now })), ["error R1"]);
});
