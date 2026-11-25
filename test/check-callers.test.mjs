import assert from "node:assert/strict";
import test from "node:test";

import { callerProblems } from "../scripts/check-callers.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const call = (ref, extra = "") => `jobs:
  no-bloat:
    uses: DrDustinEdwards/devkit/.github/workflows/no-bloat.yml@${ref}
${extra}`;

const DEPLOY = (install = "") => `jobs:
  deploy:
    uses: DrDustinEdwards/devkit/.github/workflows/worker-deploy.yml@${SHA}
    with:
      worker-name: x
${install}      health-url: https://example.com/health
  other:
    uses: DrDustinEdwards/devkit/.github/workflows/no-bloat.yml@${SHA}
    with:
      install: npm ci
`;

test("a full commit sha is accepted, with a version comment, CRLF line endings or a script-free install", () => {
  for (const text of [
    call(SHA),
    call(`${SHA} # v1.2.0`),
    call(SHA).replace(/\n/g, "\r\n"),
    ...[
      "",
      "      install: npm ci --ignore-scripts\n",
      '      install: "cd ../.. && npm ci --ignore-scripts"\n',
      '      install: cd .. && INSTALL= node "$GITHUB_WORKSPACE/.devkit/bin/deploy-install.mjs"\n',
      "      install: >-\n        npm ci\n        --ignore-scripts\n",
    ].map(DEPLOY),
  ])
    assert.deepEqual(callerProblems(text), [], JSON.stringify(text));
});

test("a branch, tag, short, uppercase or 41-character ref, secrets: inherit, a script-running install, or no call at all is refused", () => {
  const branch = callerProblems(call("main"));
  assert.equal(branch.length, 1);
  assert.match(branch[0].problem, /not a full 40-character commit sha/);
  const inherit = callerProblems(call(SHA, "    secrets: inherit\n"));
  assert.equal(inherit.length, 1);
  assert.match(inherit[0].problem, /pass each secret by name/);
  for (const text of [
    call("v1"),
    call(SHA.slice(0, 7)),
    `jobs:\n  a:\n    uses: DrDustinEdwards/devkit/.github/workflows/no-bloat.yml@${SHA}\n  b:\n    uses: "DrDustinEdwards/devkit/.github/workflows/no-bloat.yml@main"\n`,
    call(SHA.toUpperCase()),
    call(`${SHA}0`),
    call(SHA, '    secrets: "inherit"\n'),
  ])
    assert.equal(callerProblems(text).length, 1, text);
  for (const install of [
    "      install: npm ci\n",
    '      install: "cd ../.. && npm ci"\n',
    "      install: >-\n        npm ci &&\n        npm run build\n",
  ]) {
    const problems = callerProblems(DEPLOY(install));
    assert.equal(problems.length, 1, install);
    assert.equal(problems[0].line, 6);
    assert.match(problems[0].problem, /--ignore-scripts/);
  }
  assert.deepEqual(callerProblems("name: x\n"), [
    { line: 0, problem: "no call to a devkit reusable workflow" },
  ]);
});
